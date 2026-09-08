import nodemailer from "nodemailer";

const transpoter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN
    },
});

// connection configuration
transpoter.verify((error, success) => {
    if(error){
        console.error("error connecting to the mail service : ", error);
    } else{
        console.log("email server is ready to send messages");
    }
});


// function to send mail
const sendEmail = async(to, subject, text, html) => {
    try{
        const info = await transpoter.sendMail({
            from: `"BANK_TRANSACTION_SYSTEM" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text,
            html,
        });

        console.log(`mail sent : %s`, info.messageId); // %s means => to put a string value here

    } catch(error){
        console.error(`error sending email: `, error);
    }
};


async function sendRegistrationEmail(userEmail, name){

    const subject = "welcome to BankTransactionSystem!";
    const text = `hello ${name},\n\nthank you for registering at BankTransactionSystem. we're excited to have you on board!\n\nbest regards,\nthe BankTransactionSystem team`;
    const html = `<p>hello ${name},</p><p>thank you for registering at BankTransactionSystem. we're excited to have you on board!</p><p>best regards,<br>the BankTransactionSystem team</p>`;

    await sendEmail(userEmail, subject, text, html);
};


async function sendTransactionEmail(userEmail, name, amount, toAccount){
    const subject = "transaction successful!";
    const text = `hello ${name},\n\nyour transaction of ${amount} to account ${toAccount} was successful.\n\nbest regards,\nthe BANK_TRANSACTION_SYSTEM team`;
    const html = `<p>hello ${name},</p><p>your transaction of ₹${amount} to account ${toAccount} was successful.</p><p>best regards,<br>the BANK_TRANSACTION_SYSTEM team</p>`;

    await sendEmail(userEmail, subject, text, html);
};


async function sendTransactionFailureEmail(userEmail, name, amount, toAccount){
    const subject = "transaction failed";
    const text = `hello ${name},\n\nwe regret to inform you that your transaction of ₹${amount} to account ${toAccount} was failed.`;
    const html = `<p>hello ${name},</p><p>we regret to inform you that your transaction of ${amount} to account ${toAccount} was failed.</p><p>best regards,<br>the BANK_TRANSACTION_SYSTEM team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

export default {
    sendRegistrationEmail,
    sendTransactionEmail,
    sendTransactionFailureEmail
};