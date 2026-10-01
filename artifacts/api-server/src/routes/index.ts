import { Router, type IRouter } from "express";
import healthRouter from "./health";
import documentsRouter from "./documents";
import notesRouter from "./notes";
import driveRouter from "./drive";
import geminiRouter from "./gemini";

const router: IRouter = Router();

router.use(healthRouter);
router.use(documentsRouter);
router.use(notesRouter);
router.use(driveRouter);
router.use(geminiRouter);

export default router;
