import { registerFinalizer } from "./finalize";
import { applyMatchStats } from "./stats";
import { advanceFromMatch } from "./tournaments";

// Reihenfolge ist wichtig: erst Statistik und Elo, danach alles, was darauf aufbaut (Ligen, Challenges, Turniere).
registerFinalizer("stats", applyMatchStats);
registerFinalizer("tournament", advanceFromMatch);
