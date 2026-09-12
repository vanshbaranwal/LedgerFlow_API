import accountModel from "../models/account.model.js";
import ledgerModel from "../models/ledger.model.js";
import transactionModel from "../models/transaction.model.js";

async function getUserLedgerFlowController(req, res){
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
            .select("_id status createdAt")
            .sort({ createdAt: -1 })
            .limit(25)
            .lean();

        const transactionIds = transactions.map((transaction) => transaction._id);

        const entries = transactionIds.length
            ? await ledgerModel
                .find({ transaction: { $in: transactionIds } })
                .select("_id account transaction amount type")
                .lean()
            : [];

        const entriesByTransaction = new Map();

        for(const entry of entries){
            const transactionId = entry.transaction.toString();
            const transactionEntries = entriesByTransaction.get(transactionId) || [];
            transactionEntries.push(entry);
            entriesByTransaction.set(transactionId, transactionEntries);
        }

        const ledgerFlow = transactions.map((transaction) => ({
            transactionId: transaction._id,
            status: transaction.status,
            createdAt: transaction.createdAt,
            entries: entriesByTransaction.get(transaction._id.toString()) || []
        }));

        return res.status(200).json({
            ledgerFlow
        });
    } catch (error) {
        console.error("ledger flow error: ", error);

        return res.status(500).json({
            message: "unable to load ledger flow"
        });
    }
};

export default {
    getUserLedgerFlowController
};
