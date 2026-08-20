import { Router, type IRouter } from "express";
import healthRouter from "./health";
import documentsRouter from "./documents";
import notesRouter from "./notes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(documentsRouter);
router.use(notesRouter);

export default router;
