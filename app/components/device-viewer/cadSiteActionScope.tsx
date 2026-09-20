'use client';

import { createContext } from 'react';

/** Only the selected workspace viewport can register CAD actions. */
export const CadSiteActionScope = createContext<{ deviceId: string } | null>(null);
