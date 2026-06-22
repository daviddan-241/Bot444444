import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import providersRouter from "./providers";
import limitsRouter from "./limits";
import deployRouter from "./deploy";
import shellRouter from "./shell";
import staticServeRouter from "./static-serve";
import systemRouter from "./system";
import projectsRouter from "./projects";
import aiRouter from "./ai";
import domainsRouter from "./domains";
import databasesRouter from "./databases";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(systemRouter);
router.use(projectsRouter);
router.use(aiRouter);
router.use(domainsRouter);
router.use(databasesRouter);
router.use(storageRouter);
router.use(providersRouter);
router.use(limitsRouter);
router.use(deployRouter);
router.use(shellRouter);
router.use(staticServeRouter);

export default router;
