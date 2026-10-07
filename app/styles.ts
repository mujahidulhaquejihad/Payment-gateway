// Size and colour live in separate fragments so variants never carry conflicting utilities.
const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-tight transition duration-150 active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:pointer-events-none disabled:opacity-60";
const primary =
  "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white ring-1 ring-emerald-700/40 shadow-[inset_0_1px_0_rgb(255_255_255/.25),0_1px_2px_rgb(5_150_105/.3),0_6px_16px_-6px_rgb(5_150_105/.5)] hover:brightness-110";
const ghost =
  "bg-white text-slate-700 ring-1 ring-slate-900/10 shadow-[0_1px_2px_rgb(15_23_42/.06)] hover:bg-slate-50 hover:text-slate-900 hover:ring-slate-900/20";

export const btn = `${base} ${primary} px-4 py-2.5 text-sm`;
export const btnLg = `${base} ${primary} px-6 py-3 text-base`;
export const btnGhost = `${base} ${ghost} px-4 py-2.5 text-sm`;
export const btnSm = `${base} ${ghost} px-3 py-1.5 text-xs`;

/** Input look without size, for custom layouts (e.g. a currency prefix). */
export const field =
  "block rounded-xl border-0 bg-white text-slate-900 ring-1 ring-inset ring-slate-900/10 shadow-[0_1px_2px_rgb(15_23_42/.04)] transition placeholder:text-slate-400 hover:ring-slate-900/20 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:shadow-[0_0_0_4px_rgb(16_185_129/.12)]";
export const input = `${field} w-full px-3.5 py-2.5 text-sm`;
export const inputSm = `${field} w-24 px-2.5 py-1.5 text-xs`;
export const label = "mb-1.5 block text-sm font-medium text-slate-700";

const surface =
  "rounded-2xl bg-white ring-1 ring-slate-900/[.06] shadow-[0_1px_2px_rgb(15_23_42/.04),0_12px_32px_-16px_rgb(15_23_42/.12)]";
export const card = `${surface} p-6`;
/** Card without padding, for tables and edge-to-edge lists. */
export const panel = `${surface} overflow-hidden`;

/** iOS-style segmented control: wrap options in `segmented`, style each with `segment(active)`. */
export const segmented = "flex rounded-xl bg-slate-900/[.05] p-1 text-sm ring-1 ring-inset ring-slate-900/[.04]";
export const segment = (on: boolean) =>
  `rounded-lg px-3 py-1 font-medium capitalize transition ${on ? "bg-white text-slate-900 shadow-[0_1px_3px_rgb(15_23_42/.12)]" : "text-slate-500 hover:text-slate-900"}`;

export const th = "px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400";
export const td = "px-5 py-3.5";
