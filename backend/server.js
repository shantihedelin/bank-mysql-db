import express from "express";
import bodyParser from "body-parser";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import cors from "cors";

// Skapa express app
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Connect to database
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "root",
  database: "bank",
  port: 8889,
});

// help function to make code look nicer
async function query(sql, params) {
  const [results] = await pool.execute(sql, params);
  return results;
}

// Generera engångslösenord
function generateOTP() {
  // Generera en sexsiffrig numerisk OTP
  const otp = Math.floor(100000 + Math.random() * 900000);
  return otp.toString();
}

// Din kod här. Skriv dina routes:

app.get("/", (req, res) => {
  res.send("first page");
});

// Skapa användare
app.post("/users", async (req, res) => {
  console.log("Received POST request to create user");
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  try {
    const result = await query(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, hashedPassword]
    );
    const userId = result.insertId;

    await query("INSERT INTO accounts (userId, amount) VALUES (?, ?)", [
      userId,
      0,
    ]);

    res.status(200).json({ message: "User created" });

  } catch (error) {
    res.status(500).json({ message: "Something went wrong creating user" });
  }
});

// Visa saldo
app.post("/me/accounts", async (req, res) => {
  const { token } = req.body;

  try {
    const result = await query(
      "SELECT amount FROM accounts INNER JOIN sessions ON accounts.userId = sessions.userId WHERE token = ?",
      [token]
    );

    if (result.length === 0) {
      return res.status(401).json({ message: "Token required" });
    }

    res.status(200).json({ saldo: result[0].amount });
  } catch (error) {
    console.error("Something went wrong while fetching balance");
    res.status(500).json({ message: "Something went wrong fetching balance" });
  }

});

  // Logga in och skapa engångslösenord
  app.post("/sessions", async (req, res) => {
    const { username, password } = req.body;

    const result = await query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);

    const user = result[0];

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: "Wrong username or password" });
    }

    const token = generateOTP();

    try {
      const existingSession = await query(
        "SELECT * FROM sessions WHERE userId = ?",
        [user.id]
      );

      if (existingSession.length === 0) {
        await query("INSERT INTO sessions (userId, token) VALUES (?, ?)", [
          user.id,
          token,
        ]);
      } else {
        await query("UPDATE sessions SET token = ? WHERE userId = ?", [
          token,
          user.id,
        ]);
      }
      res.status(200).json({ userId: user.id, token });
    } catch (error) {
      console.error("Something went wrong when updating session");
      res.status(500).json({ message: "Error updating session" });
    }
  });


// Sätta in pengar
app.post("/me/accounts/transactions", async (req, res) => {
  const { token, amount } = req.body;

  try {
    const sessionResult = await query(
      "SELECT userId FROM sessions WHERE token = ?",
      [token]
    );

    if (sessionResult.length === 0) {
      return res.status(401).json({ message: "Invalid session" });
    }

    const userId = sessionResult[0].userId;

    await query("UPDATE accounts SET amount = amount + ? WHERE userId = ?", [
      amount,
      userId,
    ]);

    const newBalanceResult = await query(
      "SELECT amount FROM accounts WHERE userId = ?",
      [userId]
    );

    res
      .status(200)
      .json({
        message: "Money succesfully transfered",
        newBalance: newBalanceResult[0].amount,
      });
  } catch (error) {
    console.error("Something went wrong transfering money");
    res.status(500).json({ message: "Something went wrong transfering money" });
  }
});

// Starta servern
const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Bankens backend körs på http://localhost:${PORT}`);
});
