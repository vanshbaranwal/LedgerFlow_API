import mongoose from "mongoose";


function connectToDB(){
    mongoose.connect(process.env.MONGO_URI)
        .then(() => {
            console.log("server is connected to the DB");
        })
        .catch(err => {
            console.log("error connecting to the DB");
            process.exit(1); // this line here means that if the server is not able to connect to the database then turn the server off here only cause with out databse the server can't do much..
        })
};

export default connectToDB;