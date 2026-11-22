"use client";

import { createContext } from "react";

/** Fehlertexte je Feldname aus der letzten Server-Antwort (`ActionState.fieldErrors`); `Form` stellt sie bereit, `Field` liest sie. */
export const FormErrorsContext = createContext<Readonly<Record<string, string>>>({});
