(function () {
  'use strict';

  // Sidebar definition. `href` is relative to the docs root (docs/docs/).
  // The renderer prepends a depth-based prefix per page.
  var SIDEBAR = [
    {
      heading: 'Getting Started',
      links: [
        { href: 'index.html',           label: 'Introduction' },
        { href: 'installation.html',    label: 'Installation' },
        { href: 'getting-started.html', label: 'Getting Started' },
        { href: 'shortcuts.html',       label: 'Keyboard Shortcuts' }
      ]
    },
    {
      heading: 'Features',
      links: [
        { href: 'features/accounts.html',         label: 'Multi-Account' },
        { href: 'features/global-search.html',    label: 'Global Search' },
        { href: 'features/filters.html',          label: 'Advanced Filtering' },
        { href: 'features/monaco-editor.html',    label: 'Monaco Editor' },
        { href: 'features/hex-viewer.html',       label: 'Hex Viewer & Binary' },
        { href: 'features/workspaces.html',       label: 'Workspaces' },
        { href: 'features/bulk-operations.html',  label: 'Bulk Operations' },
        { href: 'features/ttl.html',              label: 'TTL Visibility' },
        { href: 'features/tabs.html',             label: 'Tabs & Navigation' },
        { href: 'features/command-palette.html',  label: 'Command Palette' },
        { href: 'features/sync.html',             label: 'Background Sync' },
        { href: 'features/themes.html',           label: 'Themes' }
      ]
    },
    {
      heading: 'Advanced',
      links: [
        { href: 'build-from-source.html', label: 'Build from Source' },
        { href: 'faq.html',               label: 'FAQ & Troubleshooting' }
      ]
    }
  ];

  // Determine current page path (relative to docs root) and depth.
  function currentPagePath() {
    var path = location.pathname;
    var segs = path.split('/').filter(function (s) { return s.length > 0; });

    // Last segment may be a filename or empty (when URL ends with "/")
    var last = segs[segs.length - 1] || '';
    var prev = segs[segs.length - 2] || '';

    if (!last || last.indexOf('.html') === -1) {
      // Treat trailing-slash URLs as index.html in that directory
      if (prev === 'features') return 'features/index.html'; // unlikely
      return 'index.html';
    }
    if (prev === 'features') {
      return 'features/' + last;
    }
    return last;
  }

  function depthOf(pagePath) {
    return pagePath.indexOf('/') === -1 ? 0 : 1;
  }

  function prefix(depth) {
    return depth === 0 ? '' : '../';
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderTopnav(depth) {
    var p = prefix(depth);
    var landingHref = depth === 0 ? '../index.html' : '../../index.html';
    var docsHref = p + 'index.html';
    var iconHref = 'https://raw.githubusercontent.com/uditalias/kvault/main/public/kvault.svg';
    return [
      '<div class="inner">',
        '<a href="', landingHref, '" class="wordmark">',
          '<img src="', iconHref, '" alt="" />',
          'KVault <span class="tag">Docs</span>',
        '</a>',
        '<button class="menu-btn" id="menuBtn" aria-label="Toggle navigation">Menu</button>',
        '<div class="topnav-links">',
          '<a href="', landingHref, '">Home</a>',
          '<a href="', docsHref, '">Docs</a>',
          '<a href="https://github.com/uditalias/kvault" class="cta">GitHub →</a>',
        '</div>',
      '</div>'
    ].join('');
  }

  function renderSidebar(currentPath, depth) {
    var p = prefix(depth);
    var html = '';
    for (var i = 0; i < SIDEBAR.length; i++) {
      var section = SIDEBAR[i];
      html += '<h3>' + escapeHtml(section.heading) + '</h3><ul>';
      for (var j = 0; j < section.links.length; j++) {
        var link = section.links[j];
        var isActive = link.href === currentPath;
        var href = p + link.href;
        html += '<li><a href="' + href + '"' +
                (isActive ? ' class="active"' : '') + '>' +
                escapeHtml(link.label) + '</a></li>';
      }
      html += '</ul>';
    }
    return html;
  }

  function wireMobileMenu() {
    var btn = document.getElementById('menuBtn');
    var sb = document.querySelector('.sidebar');
    if (!btn || !sb) return;
    btn.addEventListener('click', function () {
      sb.classList.toggle('open');
    });
  }

  function init() {
    var currentPath = currentPagePath();
    var depth = depthOf(currentPath);

    var topnav = document.querySelector('nav.topnav');
    var sidebar = document.querySelector('aside.sidebar');

    if (topnav && !topnav.firstElementChild) {
      topnav.innerHTML = renderTopnav(depth);
    }
    if (sidebar && !sidebar.firstElementChild) {
      sidebar.innerHTML = renderSidebar(currentPath, depth);
    }

    wireMobileMenu();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
