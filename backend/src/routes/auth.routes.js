import express from "express";
import authcontroller from "../controllers/auth.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = express.Router();



router.post("/register", authcontroller.userRegisterController);
router.post("/login", authcontroller.userLoginController);
router.post("/logout",authcontroller.userLogoutController);
router.get("/me", authMiddleware.authMiddleware, authcontroller.getCurrentUserController);


export default router;
