import userModel from "../models/user.model.js";
import tokenBlackListModel from "../models/blackList.model.js";
import emailService from "../services/email.service.js";
import jwt from "jsonwebtoken";



async function userRegisterController(req, res){
    const { email, password, name } = req.body;

    const isExists = await userModel.findOne({ email: email });

    if(isExists){
        return res.status(422).json({
            message: "user already exists",
            status: "failed" 
        });
    };

    const user = await userModel.create({
        email,
        password,
        name
    });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "3d" });
    res.cookie("token", token);

    res.status(201).json({
        user:{
            _id: user._id,
            email: user.email,
            name: user.name,
            createdAt: user.createdAt
        },
        token
    });

    await emailService.sendRegistrationEmail(user.email, user.name);

};


async function userLoginController(req, res){
    const { email, password } = req.body;

    const user = await userModel.findOne({ email }).select("+password");

    if(!user){
        return res.status(401).json({
            message: "credentials invalid",
        });
    };

    const isValidPassword = await user.comparePassword(password);

    if(!isValidPassword){
        return res.status(401).json({
            message: "credentials invalid"
        });
    };

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "3d" });
    res.cookie("token", token);

    res.status(200).json({
        user: {
            _id: user._id,
            email: user.email,
            name: user.name,
            createdAt: user.createdAt
        },
        token
    });
};

async function getCurrentUserController(req, res){
    return res.status(200).json({
        user: {
            _id: req.user._id,
            email: req.user.email,
            name: req.user.name,
            createdAt: req.user.createdAt
        }
    });
};


async function userLogoutController(req, res){
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1]

    if(!token){
        return res.status(200).json({
            message: "user logged out successfully"
        });
    }

    await tokenBlackListModel.create({
        token: token
    });

    res.clearCookie("token");

    res.status(200).json({
        message: "user logged out successfully"
    });

};



export default {
    userRegisterController,
    userLoginController,
    getCurrentUserController,
    userLogoutController
};
