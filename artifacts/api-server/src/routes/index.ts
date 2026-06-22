import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import providersRouter from "./providers";
import limitsRouter from "./limits";
import shellRouter from "./shell";
import systemRouter from "./system";
import projectsRouter from "./projects";
import aiRouter from "./ai";
import domainsRouter from "./domains";
import databasesRouter from "./databases";
import storageRouter from "./storage";
import deployEngineRouter from "./deploy-engine";
import deployRouter from "./deploy";

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
router.use(deployEngineRouter);
router.use(deployRouter);
router.use(shellRouter);

export default router;
