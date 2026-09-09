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
    
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body;

    if(fromAccount == null || toAccount == null || amount == null || idempotencyKey == null){
        return res.status(400).json({
            message: "fromAccount, toAccount, amount and idempotencyKey are required"
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

    if(fromAccount.currency !== toUserAccount.currency){
        return res.status(400).json({
            message: "source and destination account currencies must be same"
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


    // 3. check account status --> (already validated inside withTransaction inside activeToAccount variable)

    // if(fromUserAccount.status !== "ACTIVE" || toUserAccount.status !== "ACTIVE"){
    //     return res.status(400).json({
    //         message: "both fromAccount and toAccount must be ACTIVE to process transaction",
    //     });    
    }
    
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
                status: "PENDING"
            }], { session });
        
            // 6. debitledger entry
        
            const debitLedgerEntry = await ledgerModel.create([{
                account: fromAccount,
                amount: amount,
                transaction: transaction._id,
                type: "DEBIT",
            }], { session });
        
            // doing this to make a 10 second delay between the transaction processing from debit to credit and for testing what happens if we give another request from the same idempotencyKey
            await new Promise(resolve => setTimeout(resolve, 10 * 1000));
                
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


export default {
    createTransaction,
    createInitialFundsTransaction
};

