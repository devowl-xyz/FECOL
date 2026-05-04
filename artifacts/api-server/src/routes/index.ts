import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gesturesRouter from "./gestures";
import sessionsRouter from "./sessions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gesturesRouter);
router.use(sessionsRouter);

export default router;
