import userModel from "../models/user.model.js";
import tokenBlackListModel from "../models/blackList.model.js";
import jwt from "jsonwebtoken";



async function authMiddleware(req, res, next){
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1]

    if(!token){
        return res.status(401).json({
            message: "unauthorized access, token is missing",
        });
    }

    const isBlackListed = await tokenBlackListModel.findOne({ token });

    if(isBlackListed){
        return res.status(401).json({
            message: "unauthorized access, token is invalid"
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await userModel.findById(decoded.userId);

        if(!user){
            return res.status(401).json({
                message: "unauthorized access, user not found",
            });
        }

        req.user = user;
        next();

    } catch (error) {
        return res.status (401).json({
            message: "unauthorized access, token is invalid"
        });
    }
};

async function authSystemUserMiddleware(req, res, next){
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if(!token){
        return res.status(401).json({
            message: "unauthorized access, token is missing"
        });
    }

    const isBlackListed = await tokenBlackListModel.findOne({ token });

    if(isBlackListed){
        return res.status(401).json({
            message: "unauthorized access, token is invalid"
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await userModel.findById(decoded.userId).select("+systemUser");

        if(!user.systemUser){
            return res.status(403).json({
                message: "forbidden access, not a system user"
            });
        }

        req.user = user;
        return next();
    } catch (error) {
        return res.status(401).json({
            message: "unauthorized access, token is invalid"
        });
    }
};

export default {
    authMiddleware,
    authSystemUserMiddleware
};