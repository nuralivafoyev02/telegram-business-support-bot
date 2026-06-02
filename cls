[33mcommit 28e536e4650ad4eac681894d611531da03a292df[m[33m ([m[1;36mHEAD[m[33m -> [m[1;32mmain[m[33m, [m[1;31morigin/main[m[33m, [m[1;31morigin/HEAD[m[33m)[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon Jun 1 20:19:51 2026 +0500

    feat(media): relay BOT_TOKEN media to Supabase Storage by default
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit 6e08805199357561aabbaecf09be2e7d2782b970[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon Jun 1 19:12:46 2026 +0500

    Initial commit

[33mcommit e78dac2a4a985250fca4a12db2426139eb5aec55[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon Jun 1 17:27:17 2026 +0500

    fix(analytics): pass custom period to employee activity drill-down
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit 087c9b5f5b6bf7eeca3aa5fb4a026862bc6a8dd9[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon Jun 1 16:39:29 2026 +0500

    fix(analytics): align company ticket chart with group ticket list totals
    
    Count only group tickets in company breakdown, include Biriktirilmagan bucket, and resolve company IDs consistently with the ticket list.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit 09409971e9cd874c591789e1aec17a4aec2e28ba[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon Jun 1 16:28:07 2026 +0500

    fix(analytics): align 1 oy period with rolling 30 days for trends and company tickets
    
    Month filter now matches 7 kun rolling window semantics. Dashboard always loads today/week/month analytics so trend and company charts follow the selected period.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit e5bd8ff7aa7f2130f45d8fbee094b57902ab5ade[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon Jun 1 13:39:14 2026 +0500

    feat(media): 20MB proxy, Supabase storage relay, voice playback UI
    
    - Raise telegramFile panel limit to 20MB for photos, voice, video and documents
    
    - Stream cached media from Supabase storage when storage_path is set
    
    - Relay incoming media to storage via optional source_bot webhook param
    
    - Improve voice player, retry reload, and OGG/opus MIME handling in admin chats
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit eee702eda63b1a8c9f3ac9826fea9a7b7d19e605[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon Jun 1 05:35:36 2026 +0500

    fix(webapp): improve OGG voice and photo blob playback in chats
    
    Use correct audio/ogg MIME types when Telegram returns octet-stream so voice and images load in the admin panel.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit c645fb05a7e64020d3cfb00ba69c5dfc20ed7cda[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon Jun 1 05:16:54 2026 +0500

    fix(media): stream telegram files and explain large video download limits
    
    Reject videos over 4 MB before proxying, stream smaller files to avoid timeouts, and show clearer errors in the chat UI.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit f55a5248f9da0e183db53e9dc6fe8d33f4de5ba4[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon Jun 1 05:08:19 2026 +0500

    fix(webapp): treat managers as helpers with zero open tickets in ranking
    
    Keep closed counts when managers reply but always show zero open tickets for Barcha menejerlar and individual manager stats.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit 735f8deefc7b74237b195f5454edaf195d946315[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon Jun 1 04:51:04 2026 +0500

    fix(media): load voice and photo messages in admin chat views
    
    Extract media from Telegram raw payloads reliably, stream telegramFile downloads with correct MIME types, and preload conversation media when employee chats update.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit ca325b4baa0fcdbabdb449fb8124aa74519c0330[m
Author: ilhom <isattorov403@gmail.com>
Date:   Sun May 31 21:39:31 2026 +0500

    fix(stats): hide unassigned company tickets and respect period
    
    Exclude Biriktirilmagan from company ticket charts by resolving company assignments and filtering unassigned rows on both backend and frontend.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit e24712d515dfacadbcfc200817a6736e5af869c6[m
Author: ilhom <isattorov403@gmail.com>
Date:   Sun May 31 21:17:28 2026 +0500

    fix(webapp): rank support staff by role and aggregate all managers
    
    Show all Texnik yordam employees in Hodimlar reytingi, combine manager stats into one row with individual drill-down, and keep unassigned rows hidden.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit 9774f098094c03ce6f78b733d602ab58be473aba[m
Author: ilhom <isattorov403@gmail.com>
Date:   Sun May 31 09:49:32 2026 +0500

    fix(webapp): hide unassigned row and map open tickets to company support
    
    Support ranking now only lists Uyqur support staff and the managers summary row. Open tickets resolve through company group assignment before appearing in stats.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit 8ed3a8b5e219cb5c9b60afe43f5e1746da08f5ec[m
Author: ilhom <isattorov403@gmail.com>
Date:   Sat May 30 11:18:25 2026 +0500

    fix(stats): assign open tickets to company support and hide unassigned ranking
    
    Open requests resolve through company/group support mapping and business connections before chat heuristics. Support ranking excludes unassigned rows and improves open-ticket employee matching.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit 6a637943104a090a4c29d7aa868e4eca5cfea3b6[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon May 25 16:57:08 2026 +0500

    ﻿fix(stats): align company tickets with support assignments
    
    Use company-info group mappings in analytics so support-owned group tickets appear under the correct company, and keep the company ticket chart strictly scoped to the selected period.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit 4a49507755b247ef4614a57ea19da68dc80c3601[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon May 25 15:49:27 2026 +0500

    ﻿fix(stats): align support analytics to selected period
    
    Count support metrics strictly by request creation date across dashboard details and surface unassigned tickets in the company chart so period totals stay consistent.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit 647152636d094086c0d9c3b9e2cdbf10b7ffc928[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon May 25 15:15:52 2026 +0500

    ﻿fix(webapp): improve voice media playback in chats
    
    Hide request badges on employee replies and add fallback audio filenames for voice and audio media so OGG voice messages load more reliably in the admin chat view.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit 9aafed5e59027e007be69c26c2eb4f1ea52ba87a[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon May 25 14:00:12 2026 +0500

    ﻿fix(parser): improve group request detection for media
    
    Treat empty voice and photo payloads as customer requests before text-only ignore checks, and tighten group conversational filtering so simple staff pings no longer open tickets.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit e4bae606bb17d9211db52e3984242d9627860b62[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon May 25 13:39:48 2026 +0500

    ﻿fix(stats): keep company chart ticket-only
    
    Remove message-based fallback values from the company ticket chart so it shows only real tickets and the closed/open breakdown stays accurate for the selected period.
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

[33mcommit ad2de8bb7468ac4d3789b5de7ed4d39323dcd178[m
Author: ilhom <isattorov403@gmail.com>
Date:   Mon May 25 13:27:25 2026 +0500

    ﻿fix(stats): scope support performance metrics to period
    
    Add period-based company totals to employee performance data and use them in the support performance ranking so the dashboard stays consistent with the selected time range.