# Weaver Admin Diagnostics Bundle
bundle_version: v4.0
bundle_date: PASTE_TODAYS_DATE_HERE

FORMAT NOTE FOR THE DIAGNOSTICS TOOL:
- Each bundled file begins with a marker line: === File [n/N]: path ===
- Bundles are pasted RAW. Never wrap them in code fences.
- Paths beginning Weaver-3/ belong to repo: Weaver
- Paths beginning weaver-server-1.0/ belong to repo: weaver-server

## 1. File tree

Weaver (frontend, GitHub Pages)
Weaver/
 ├── index.html                  # app shell (login → launch → workspace)
 ├── css/                        # global stylesheet: tokens, .panel/.btn/.ms-block base
 ├── docs/HELP.md                # Guide source + support AI knowledge
 ├── welcome/                    # marketing site (index/pricing/features + site.css)
 ├── admin/
 │   ├── index.html              # console: Overview/Users/Credits/Storage/Audit/Banner/AI Keys/Messages/Important
 │   ├── supervisors.html        # supervisor management
 │   └── diagnostics.html        # this tool's UI
 └── js/
     ├── app.js                  # boot, auth gate, namespace, view routing, Focus shortcut
     ├── core/{state,storage,entitlements,resizers,supabase}.js
     ├── auth/auth.js
     ├── views/{launch,workspace,wizard}.js
     ├── panels/{manuscript,main-novel,ai-output}.js
     ├── features/{scribe,export,settings,notes,cloud,puter-mirror,plot-reference,
     │             plot-builder,config-bible,guide,support,hierarchy,
     │             cover-gen,focus-mode,search,capture,banner,mobile-dock}.js
     ├── ai/{manager,model-router}.js + providers/
     └── utils/{dom,icons,text,docx,zip}.js

weaver-server (Supabase Edge Functions)
weaver-server/
├── .github/workflows/{deploy-functions,backup-schedule}.yml
└── supabase/functions/
    ├── admin/index.ts            # owner console API
    ├── support-admin/index.ts    # tickets/replies/help-log (owner + supervisor)
    ├── supervisor-admin/index.ts # supervisor CRUD + role check
    ├── support/index.ts          # user tickets + W-tag assignment
    ├── help/index.ts             # support lookup (HELP.md retrieval)
    ├── ai-proxy/index.ts         # streaming AI gateway
    └── ai-admin/index.ts         # ai_config CRUD + tests

## 2. WEAVER FRONTEND BUNDLE
<<<PASTE_SLOT_A: Delete this line and paste the ENTIRE Weaver repo bundle here (your bundler output with the === File [n/N] markers).>>>

## 3. WEAVER-SERVER BACKEND BUNDLE
<<<PASTE_SLOT_B: Delete this line and paste the ENTIRE weaver-server bundle here (your bundler output with the === File [n/N] markers).>>>
