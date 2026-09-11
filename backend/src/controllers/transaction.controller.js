import ledgerModel from "../models/ledger.model.js";
import emailService from "../services/email.service.js";
import mongoose from "mongoose";
import transactionModel from "../models/transaction.model.js";
import accountModel from "../models/account.model.js";

// create a new transaction
/*

transaction flow
  1. validate request
  2. validate idempotency key
  3. check account status
  4. derive sender balance from ledger
  5. create transaction (PENDING)
  6. create debit ledger entry
  7. create credit ledger entry
  8. mark transaction COMPLETED
  9. commit mongoDB session
  10. send email notification

*/

async function createTransaction(req, res){
    
    // 1. validate request
    
    const { fromAccount, toAccount, amount, idempotencyKey, description } = req.body;

    if(fromAccount == null || toAccount == null || amount == null || idempotencyKey == null){
        return res.status(400).json({
            message: "fromAccount, toAccount, amount and idempotencyKey are required"
        });
    }

    if(description != null && (typeof description !== "string" || description.trim().length > 120)){
        return res.status(400).json({
            message: "description must contain atmost 120 characters"
        });
    }

    if(!mongoose.Types.ObjectId.isValid(fromAccount) || !mongoose.Types.ObjectId.isValid(toAccount)){
        return res.status(400).json({
            message: "fromAccount and toAccount must be a valid account ids"
        });
    }

    if(typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0){
        return res.status(400).json({
            message: "amount must be a positive finite number"
        });
    }

    if(fromAccount === toAccount){
        return res.status(400).json({
            message: "source and destination account must be different"
        });
    }

    if(typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0 || idempotencyKey.trim().length > 128){
        return res.status(400).json({
            message: "idempotency must be a non empty string of at most 128 characters"
        });
    }

    const normalizedIdempotencyKey = idempotencyKey.trim();

    const fromUserAccount = await accountModel.findOne({
        _id: fromAccount,
        user: req.user._id
    });

    if(!fromUserAccount){
        return res.status(404).json({
            message: "source account not found or not owned by the authenticated user"
        });
    }

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    });

    if(!toUserAccount){
        return res.status(404).json({
            message: "destination account not found",
        });
    }

    // 2. validate idempotecyKey (we use idempotency key so that the same payment should now be occuring two times)

    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey: normalizedIdempotencyKey
    });

    if(isTransactionAlreadyExists){
        if(isTransactionAlreadyExists.status === "COMPLETED"){
            return res.status(200).json({
                message: "transaction already processed",
                transaction: isTransactionAlreadyExists,
            });
        }

        if(isTransactionAlreadyExists.status === "PENDING"){
            return res.status(200).json({
                message: "transaction is still in processing",
            });
        }

        if(isTransactionAlreadyExists.status === "FAILED"){
            return res.status(500).json({
                message: "transaction processing failed, please retry",
            });
        }

        if(isTransactionAlreadyExists.status === "REVERSED"){
            return res.status(500).json({
                message: "transaction was reversed, please retry",
            });
        }
    }


    // 3. account statuses are validated within the MongoDB transaction
    
    const session = await mongoose.startSession();
    let transaction;

    try {
        await session.withTransaction(async () => {
            // lock serializing transfers from this account
            const lockedFromAccount = await accountModel.findOneAndUpdate(
                {
                    _id: fromAccount,
                    user: req.user._id,
                    status: "ACTIVE"
                },
                {
                    $inc: { transactionVersion: 1 }
                },
                {
                    session,
                    new: true
                }
            );

            if(!lockedFromAccount){
                const error = new Error("source account not found, not owned by user, or inactive");
                error.statusCode = 404;
                throw error;
            }
            
            const activeToAccount = await accountModel.findOne({
                _id: toAccount,
                status: "ACTIVE"
            }).session(session);

            if(!activeToAccount){
                const error = new Error("destination account not found or is not ACTIVE");

                error.statusCode = 404;
                throw error;
            }

            if(lockedFromAccount.currency !== activeToAccount.currency){
                const error = new Error("source and destination account currencies must match");
                error.statusCode = 400;
                throw error;
            }


            // 4. derive sender balance from ledger (using aggregation pipeline)
            const balance = await lockedFromAccount.getBalance(session);

            if(balance < amount){
                const error = new Error(`insufficient balance. current balance is ${balance}, and the requested amount is ${amount}`);
                error.statusCode = 400;
                throw error;
            }

            // 5. create transaction (PENDING)
        
            [transaction] = await transactionModel.create([{
                fromAccount,
                toAccount,
                amount,
                idempotencyKey: normalizedIdempotencyKey,
                description: description?.trim() || "",
                status: "PENDING"
            }], { session });
        
            // 6. debitledger entry
        
            const debitLedgerEntry = await ledgerModel.create([{
                account: fromAccount,
                amount: amount,
                transaction: transaction._id,
                type: "DEBIT",
            }], { session });
        
            // 7. credit ledger entry
        
            const creditLedgerEntry = await ledgerModel.create([{
                account: toAccount,
                amount: amount,
                transaction: transaction._id,
                type: "CREDIT"
            }], { session });
                
            // 8. mark transaction COMPLETED
            
            transaction = await transactionModel.findOneAndUpdate(
                { _id: transaction._id },
                { status: "COMPLETED" },
                { 
                    session,
                    new: true   // here new: true tells the mongoose to return the document after the update
                }  
            );
        });

    } catch (error) {
        console.error("transaction error: ", error);
        return res.status(error.statusCode || 400).json({
            message: error.statusCode ? error.message : "Transaction processing failed. Please try again."
        });
    } finally{
        await session.endSession();
    }

    // 10. send email notification

    await emailService.sendTransactionEmail(req.user.email, req.user.name, amount, toAccount);

    return res.status(201).json({
        message: "transaction completed successfully",
        transaction
    });
};

async function createInitialFundsTransaction(req, res){
    const { toAccount, amount, idempotencyKey } = req.body;

    if(!toAccount || !amount || !idempotencyKey){
        return res.status(400).json({
            message: "toAccount, amount and idempotencyKey are required"
        });
    }

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    });

    if(!toUserAccount){
        return res.status(400).json({
            message: "invalid toAccount"
        });
    }

    const fromUserAccount = await accountModel.findOne({
        user: req.user._id
    });

    if(!fromUserAccount){
        return res.status(400).json({
            message: "system user account is not found"
        });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    const transaction = new transactionModel({
        fromAccount: fromUserAccount._id,
        toAccount,
        amount,
        idempotencyKey,
        status: "PENDING"
    });

    const debitLedgerEntry = await ledgerModel.create([{
        account: fromUserAccount._id,
        amount: amount,
        transaction: transaction._id,
        type: "DEBIT"
    }], { session });

    const creditLedgerEntry = await ledgerModel.create([{
        account: toAccount,
        amount: amount,
        transaction: transaction._id,
        type: "CREDIT"
    }], { session });

    transaction.status = "COMPLETED";
    await transaction.save({ session });


    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
        message: "initial funds transaction completed successfully",
        transaction: transaction
    });
    
};


async function getUserTransactions(req, res){
    try {
        const userAccounts = await accountModel
            .find({ user: req.user._id })
            .select("_id")
            .lean();

        const accountIds = userAccounts.map((account) => account._id);

        const transactions = await transactionModel
            .find({
                $or: [
                    { fromAccount: { $in: accountIds } },
                    { toAccount: { $in: accountIds } }
                ]
            })
            .select("_id fromAccount toAccount amount status createdAt")
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        return res.status(200).json({
            transactions
        });

    } catch (error) {
        console.error("transaction history error: ", error);

        return res.status(500).json({
            message: "unable to load transaction history"
        });
    }
};


async function getTransactionDetails(req, res){
    try {
        const { transactionId } = req.params;

        if(!mongoose.Types.ObjectId.isValid(transactionId)){
            return res.status(400).json({
                message: "invalid transaction ID"
            });
        }

        const userAccounts = await accountModel
            .find({ user: req.user._id })
            .select("_id")
            .lean();

        const accountIds = userAccounts.map((account) => account._id);

        const transaction = await transactionModel
            .findOne({
                _id: transactionId,
                $or: [
                    { fromAccount: { $in: accountIds } },
                    { toAccount: { $in: accountIds } }
                ]
            })
            .select("_id fromAccount toAccount amount status description idempotencyKey createdAt")
            .lean();

        if(!transaction){
            return res.status(404).json({
                message: "transaction not found"
            });
        }

        return res.status(200).json({
            transaction
        });

    } catch (error) {
        console.error("transaction details error: ", error);

        return res.status(500).json({
            message: "unable to load transaction details"
        });
    }
};

export default {
    createTransaction,
    createInitialFundsTransaction,
    getUserTransactions,
    getTransactionDetails
};

