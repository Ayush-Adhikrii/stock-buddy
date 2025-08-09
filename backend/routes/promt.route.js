import express from "express";
import multer from "multer";
import { sendPromt } from "../controller/promt.controller.js";
import userMiddleware from "../middleware/promt.middlware.js";

const router = express.Router();

const upload = multer({
    dest: "public/uploads/",
    limits: {
        fileSize: 15 * 1024 * 1024, // 15 MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed!"), false);
        }
    },
});

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            error: "File upload error",
            detail: err.message,
        });
    }
    next(err);
};

// Log request details for debugging
router.post("/promt", upload.single("file"), (req, res, next) => {
    console.log("Route - Received body:", req.body);
    console.log("Route - Received file:", req.file);
    next();
}, userMiddleware, handleMulterError, sendPromt);

export default router;