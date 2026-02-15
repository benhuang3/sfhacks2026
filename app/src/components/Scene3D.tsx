/**
 * Scene3D — fallback / type-resolution re-export.
 *
 * Metro automatically picks Scene3D.native.tsx (native) or
 * Scene3D.web.tsx (web) at bundle time.  This bare .tsx file
 * exists so that TypeScript's module resolution (which does NOT
 * understand .native/.web suffixes) can find the module when
 * other files import from './Scene3D'.
 */
export { Scene3D } from './Scene3D.native';
