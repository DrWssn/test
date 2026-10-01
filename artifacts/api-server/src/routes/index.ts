import { Router, type IRouter } from "express";
import healthRouter from "./health";
import documentsRouter from "./documents";
import notesRouter from "./notes";
import driveRouter from "./drive";

const router: IRouter = Router();

router.use(healthRouter);
router.use(documentsRouter);
router.use(notesRouter);
router.use(driveRouter);

export default router;
