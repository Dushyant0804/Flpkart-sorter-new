const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const SALT_ROUNDS = 10;
async function userRoutes(fastify, options) {
  const pool = fastify.pg;

  // 🟢 SIGNUP / CREATE ACCOUNT
  fastify.post("/signup", async (request, reply) => {
    const { username, password, confirmPassword } = request.body;
    console.log("Signup request:", { username, password, confirmPassword });

    try {
      if (!username || !password || !confirmPassword) {
        return reply.code(400).send({ message: "All fields are required" });
      }

      if (password !== confirmPassword) {
        return reply.code(400).send({ message: "Passwords do not match" });
      }

      const existing = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
      if (existing.rows.length > 0) {
        return reply.code(400).send({ message: "Username already exists" });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      await pool.query(
        `INSERT INTO users (username, password, role, created_at) VALUES ($1, $2, $3, NOW())`,
        [username, hashedPassword, "user"]
      );

      await pool.query(
        `INSERT INTO user_logs (username, message, timestamp) VALUES ($1, $2, NOW())`,
        [username, "account_created"]
      );

      fastify.log.info(`✅ New user created: ${username}`);
      reply.code(201).send({ message: "Account created successfully" });
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ message: "Server error during signup" });
    }
  });

  // 🟢 LOGIN
  fastify.post("/login", async (request, reply) => {
    const { username, password } = request.body;

    try {
      const res = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
      const user = res.rows[0];

      if (!user) {
        fastify.log.warn("❌ User not found");
        return reply.code(400).send({ message: "Invalid username or password" });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return reply.code(400).send({ message: "Invalid username or password" });
      }

      const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      await pool.query(
        `INSERT INTO user_logs (username, message, timestamp) VALUES ($1, $2, NOW())`,
        [username, "login"]
      );

      reply.send({ token, username: user.username, role: user.role });
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ message: "Server error during login" });
    }
  });

  // 🟢 LOGOUT
  fastify.post("/logout", async (request, reply) => {
    reply.send({ message: "Logged out successfully" });
  });

  // 🟢 GET ALL USERS
  fastify.get("/users", async (request, reply) => {
    try {
      const res = await pool.query(
        "SELECT id, username, role, created_at FROM users ORDER BY id ASC"
      );
      reply.send(res.rows);
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ message: "Failed to fetch users" });
    }
  });

  // 🟢 DELETE USER (existing)
  fastify.delete("/users/:id", async (request, reply) => {
    const { id } = request.params;
    try {
      const userRes = await pool.query("SELECT username FROM users WHERE id = $1", [id]);
      if (userRes.rowCount === 0) {
        return reply.code(404).send({ message: "User not found" });
      }

      const username = userRes.rows[0].username;
      await pool.query("DELETE FROM users WHERE id = $1", [id]);

      await pool.query(
        `INSERT INTO user_logs (username, message, timestamp) VALUES ($1, $2, NOW())`,
        [username, "account_deleted"]
      );

      fastify.log.info(`🗑️ User deleted: ${username}`);
      reply.send({ message: "User deleted successfully" });
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ message: "Failed to delete user" });
    }
  });

  fastify.get("/getSubAdmin", async (request, reply) => {
    try {
      const res = await pool.query(
        "SELECT id,password, username, role, created_at FROM users WHERE role = 'user' ORDER BY id ASC"
      );
      reply.send(res.rows);
    } catch (err) {
      console.error("❌ Fetch operators error:", err);
      reply.code(500).send({ error: "Failed to fetch operators" });
    }

  });

  fastify.post("/deleteUser", async (request, reply) => {
    try {
      const { username, password, role } = request.body;

      // validation
      if (!username || !password || !role) {
        return reply.status(400).send({
          success: false,
          message: "All fields are required",
        });
      }

      // insert query
      const query = `
          INSERT INTO users (
            username,
            password,
            role,
            created_at
          )
          VALUES ($1, $2, $3, NOW())
          RETURNING *;
        `;

      const values = [username, password, role];

      const result = await fastify.pg.query(query, values);

      return reply.status(201).send({
        success: true,
        message: "User created successfully",
        data: result.rows[0],
      });

    } catch (err) {
      console.log(err);

      return reply.status(500).send({
        success: false,
        message: "Internal Server Error",
      });
    }
  });

  fastify.delete("/deleteSubAdmin/:id", async (request, reply) => {
    const { id } = request.params;

    try {
      const res = await pool.query(
        "DELETE FROM users WHERE id = $1 RETURNING id",
        [id]
      );

      if (res.rows.length === 0) {
        return reply.code(404).send({ error: "User not found" });
      }

      reply.send({ success: true });

    } catch (err) {
      console.error("❌ Delete user error:", err);
      reply.code(500).send({ error: "Failed to delete user" });
    }
  })

  fastify.put("/updateSubAdmin/:id", async (request, reply) => {

    const { id } = request.params;
    const { username, password, role } = request.body;
    try {
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const res = await pool.query(
        `UPDATE users
           SET 
           username = $1,
           password = $2,
               role = $3
           WHERE id = $4
           RETURNING id, username, role`,
        [username, hashedPassword, role, id]
      );

      if (res.rows.length === 0) {
        return reply.code(404).send({ error: "User not found" });
      }

      reply.send(res.rows[0]);

    } catch (err) {
      console.error("❌ Update user error:", err);
      reply.code(500).send({ error: "Failed to update user" });
    }
  });

  // 🟢 NEW USER
  fastify.post("/newUser", async (request, reply) => {
    try {
      const { username, password, role } = request.body;

      // validation
      if (!username || !password || !role) {
        return reply.status(400).send({
          success: false,
          message: "All fields are required",
        });
      }
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      // insert query
      const query = `
          INSERT INTO users (
            username,
            password,
            role,
            created_at
          )
          VALUES ($1, $2, $3, NOW())
          RETURNING *;
        `;

      const values = [username, hashedPassword, role];

      const result = await fastify.pg.query(query, values);

      return reply.status(201).send({
        success: true,
        message: "User created successfully",
        data: result.rows[0],
      });

    } catch (err) {
      console.log(err);

      return reply.status(500).send({
        success: false,
        message: "Internal Server Error",
      });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // 🟢 SUB-USERS — used by the Sub Users tab in SettingsPage
  // ══════════════════════════════════════════════════════════════

  // // POST /api/sub-users — create user with hashed password
  // fastify.post("/newUser", async (request, reply) => {
  //   const { username, password, role } = request.body;

  //   fastify.log.info(`📥 POST /sub-users called with username: ${username}, role: ${role}`);

  //   if (!username || !password) {
  //     return reply.code(400).send({ message: "Username and password are required" });
  //   }

  //   try {
  //     // Check duplicate
  //     const existing = await pool.query(
  //       "SELECT id FROM users WHERE username = $1",
  //       [username]
  //     );
  //     if (existing.rows.length > 0) {
  //       return reply.code(400).send({ message: "Username already exists" });
  //     }

  //     // Hash password
  //     const hashed = await bcrypt.hash(password, 10);

  //     const result = await pool.query(
  //       `INSERT INTO users (username, password, role, created_at)
  //        VALUES ($1, $2, $3, NOW())
  //        RETURNING id, username, role, created_at`,
  //       [username, hashed, role || "user"]
  //     );

  //     fastify.log.info(`✅ Sub-user created: ${username}`);
  //     reply.code(201).send(result.rows[0]);
  //   } catch (err) {
  //     fastify.log.error(`❌ Failed to create sub-user: ${err.message}`);
  //     reply.code(500).send({ message: "Failed to create user" });
  //   }
  // });

  // // PUT /api/sub-users/:id — update user; re-hash password only if provided
  // fastify.put("/sub-users/:id", async (request, reply) => {
  //   const { id } = request.params;
  //   const { username, password, role } = request.body;

  //   fastify.log.info(`📥 PUT /sub-users/${id} called`);

  //   if (!username) {
  //     return reply.code(400).send({ message: "Username is required" });
  //   }

  //   try {
  //     let result;

  //     if (password && password.trim() !== "") {
  //       // Re-hash the new password
  //       const hashed = await bcrypt.hash(password, 10);
  //       result = await pool.query(
  //         `UPDATE users
  //          SET username = $1, password = $2, role = $3
  //          WHERE id = $4
  //          RETURNING id, username, role, created_at`,
  //         [username, hashed, role || "user", id]
  //       );
  //     } else {
  //       // Keep existing password hash untouched
  //       result = await pool.query(
  //         `UPDATE users
  //          SET username = $1, role = $2
  //          WHERE id = $3
  //          RETURNING id, username, role, created_at`,
  //         [username, role || "user", id]
  //       );
  //     }

  //     if (result.rowCount === 0) {
  //       return reply.code(404).send({ message: "User not found" });
  //     }

  //     fastify.log.info(`✅ Sub-user updated: ${username}`);
  //     reply.send(result.rows[0]);
  //   } catch (err) {
  //     fastify.log.error(`❌ Failed to update sub-user: ${err.message}`);
  //     reply.code(500).send({ message: "Failed to update user" });
  //   }
  // });

  // // DELETE /api/sub-users/:id
  // fastify.delete("/sub-users/:id", async (request, reply) => {
  //   const { id } = request.params;

  //   fastify.log.info(`📥 DELETE /sub-users/${id} called`);

  //   try {
  //     const result = await pool.query(
  //       "DELETE FROM users WHERE id = $1 RETURNING username",
  //       [id]
  //     );

  //     if (result.rowCount === 0) {
  //       return reply.code(404).send({ message: "User not found" });
  //     }

  //     fastify.log.info(`🗑️ Sub-user deleted: ${result.rows[0].username}`);
  //     reply.send({ message: "User deleted successfully" });
  //   } catch (err) {
  //     fastify.log.error(`❌ Failed to delete sub-user: ${err.message}`);
  //     reply.code(500).send({ message: "Failed to delete user" });
  //   }
  // });
}

module.exports = userRoutes;