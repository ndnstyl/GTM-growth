// Generic line icons for the GTM OS surface nodes (48x48, stroke #888 recoloured at draw time).
(function () {
  const wrap = (inner) => '<svg viewBox="0 0 48 48" fill="none" stroke="#888" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  window.BRAIN_ICONS = {
    'app:cockpit': wrap('<rect x="8" y="8" width="13" height="13" rx="2"/><rect x="27" y="8" width="13" height="13" rx="2"/><rect x="8" y="27" width="13" height="13" rx="2"/><rect x="27" y="27" width="13" height="13" rx="2" opacity="0.6"/>'),
    'app:exec': wrap('<path d="M10 38V24M20 38V14M30 38V20M40 38V8" /><path d="M6 40h36" opacity="0.5"/>'),
    'app:studio': wrap('<rect x="7" y="12" width="34" height="24" rx="4"/><path d="M20 19l10 5-10 5z"/>'),
    'app:paid': wrap('<circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="9" opacity="0.7"/><circle cx="24" cy="24" r="2.5" fill="#888"/>'),
    'app:qr': wrap('<rect x="8" y="8" width="12" height="12" rx="1.5"/><rect x="28" y="8" width="12" height="12" rx="1.5"/><rect x="8" y="28" width="12" height="12" rx="1.5"/><path d="M28 28h5v5h-5zM36 36h4M36 28v4" opacity="0.8"/>'),
    'app:consent': wrap('<path d="M24 7l15 6v10c0 9-6 15-15 18C15 38 9 32 9 23V13z"/><path d="M17 24l5 5 9-10" />'),
    'app:frontdoor': wrap('<path d="M9 11h30a2 2 0 012 2v18a2 2 0 01-2 2H22l-8 7v-7H9a2 2 0 01-2-2V13a2 2 0 012-2z"/><path d="M15 20h18M15 26h11" opacity="0.7"/>'),
    'app:connect': wrap('<path d="M6 24h6l4-12 6 24 6-18 4 6h10"/>'),
    'app:mer': wrap('<circle cx="24" cy="24" r="16"/><path d="M17 31L31 17" /><circle cx="18" cy="18" r="2.5" fill="#888"/><circle cx="30" cy="30" r="2.5" fill="#888"/>'),
    'app:costtarget': wrap('<path d="M8 32a16 16 0 0132 0"/><path d="M24 32l8-10" /><circle cx="24" cy="32" r="2.5" fill="#888"/><path d="M8 38h32" opacity="0.5"/>'),
    'app:loops': wrap('<path d="M38 20a14 14 0 00-26-4M10 28a14 14 0 0026 4"/><path d="M12 8v8h8M36 40v-8h-8"/>'),
    'app:health': wrap('<path d="M24 40S8 30 8 19a8 8 0 0116-3 8 8 0 0116 3c0 11-16 21-16 21z"/><path d="M14 24h6l3-5 4 9 3-4h4" opacity="0.8"/>'),
  };
})();
