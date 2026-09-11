import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, "email is required for creating the user"],
        trim: true,
        lowercase: true,
        match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "invalid email address"],
        unique: [true, "email already exists"]
    },

    name: {
        type: String,
        required: [true, "name is required for creating an account"]
    },

    password: {
        type: String,
        required: [true, "password is required for creating an account"],
        minlength: [6, "password should be atleast 6 characters long"],
        select: false,

    },

    systemUser: {
        type: Boolean,
        default: false,
        immutable: true,
        select: false
    }
    
}, {
    timestamps: true
})

userSchema.pre("save", async function(next) {

    if(!this.isModified("password")){
        return next;
    };

    const hash = await bcrypt.hash(this.password, 10);
    this.password = hash;

    return next;
});

userSchema.methods.comparePassword = async function(password){
    return await bcrypt.compare(password, this.password);
};

const userModel = mongoose.model("user", userSchema);

export default userModel;