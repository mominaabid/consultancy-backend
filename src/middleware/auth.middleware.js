// import jwt from 'jsonwebtoken';

// export default function auth(req, res, next) {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

//   if (!token) {
//     return res.status(401).json({ message: 'Access denied. No token provided.' });
//   }

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = decoded; // { id, role, name, email }
//     next();
//   } catch {
//     return res.status(401).json({ message: 'Invalid or expired token.' });
//   }
// }

import jwt from "jsonwebtoken";

export default function auth(req, res, next) {
  // ✅ Try header first
  const authHeader = req.headers["authorization"];
  let token = authHeader && authHeader.split(" ")[1];

  // ✅ Fallback to query (for SSE)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role, name, email }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}
