import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import providersRouter from "./providers";
import limitsRouter from "./limits";
import deployRouter from "./deploy";
import shellRouter from "./shell";
import staticServeRouter from "./static-serve";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(providersRouter);
router.use(limitsRouter);
router.use(deployRouter);
router.use(shellRouter);
router.use(staticServeRouter);

export default router;
