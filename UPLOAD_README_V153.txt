Alexander OS V15.3

Upload these files to the ROOT of senyaav27/alexander-os:
1. index.html - REPLACE existing
2. sw.js - REPLACE existing
3. runtime-v153.js - ADD new

You do NOT need to delete old files.
The following old JS files can remain in GitHub, but V15.3 no longer loads them:
- motion-v15.js
- finance-v151.js
- features-v152.js

Keep all existing CSS and app.js files.

After GitHub Pages deploys:
1. Fully close Alexander OS on iPhone.
2. Open it again.
3. If the installed PWA still shows V15.2 on the first launch, close it once more and reopen - the service worker cache is now V15.3.
4. The header should show V15.3.

Main fix: removal of the recursive MutationObserver/render loop that caused tabs and buttons to lag.
