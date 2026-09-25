Alexander OS V15.0 - Design + Motion Upgrade

Что загрузить в корень репозитория senyaav27/alexander-os:

1. ЗАМЕНИТЬ index.html
2. ЗАМЕНИТЬ sw.js
3. ДОБАВИТЬ styles-v15.css
4. ДОБАВИТЬ motion-v15.js

Файлы app.js и styles.css НЕ МЕНЯТЬ.
Новая стилизация подключается поверх текущего styles.css, поэтому логика и данные Alexander OS остаются прежними.

Что добавлено:
- более строгий black/emerald дизайн в стиле предоставленного референса;
- компактные карточки, tabs, header, bottom navigation;
- spring-like screen enter через Web Animations API;
- stagger для карточек и списков;
- анимация progress bars и charts при появлении;
- press/release spring для кнопок;
- анимация checkbox;
- morph-like active state нижней навигации;
- prefers-reduced-motion;
- обновлён PWA cache v15.0.0.

После загрузки:
- открыть GitHub Pages;
- сделать hard refresh;
- если PWA установлена на iPhone, закрыть её полностью и открыть снова.
