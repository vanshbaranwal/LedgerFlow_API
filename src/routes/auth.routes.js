import express from "express";
import authcontroller from "../controllers/auth.controller.js";

const router = express.Router();



router.post("/register", authcontroller.userRegisterController);
router.post("/login", authcontroller.userLoginController);
router.post("/logout",authcontroller.userLogoutController);


export default router;