import { Router } from "express";
import {
    login,
    getMe,
    verifySetupToken,
    setupPassword,
    verifyCounsellorSetupToken,
    setupCounsellorPassword,
    counsellorLogin,
    changePassword,
} from "../controllers/auth.controller.js";
import auth from "../middleware/auth.middleware.js";

const router = Router();

router.post("/login", login);
router.get("/me", auth, getMe);
router.get("/verify-setup-token", verifySetupToken);
router.post("/setup-password", setupPassword);

router.post("/counsellor/login", counsellorLogin);
router.get("/counsellor/verify-setup-token", verifyCounsellorSetupToken);
router.post("/counsellor/setup-password", setupCounsellorPassword);

router.get("/debug-token", auth, (req, res) => {
    res.json({
        user: req.user,
        headers: req.headers.authorization,
    });
});

router.post("/change-password", auth, changePassword);

export default router;