import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import ledgerController from "../controllers/ledger.controller.js";

const router = express.Router();

router.get("/", authMiddleware.authMiddleware, ledgerController.getUserLedgerFlowController);

export default router;
