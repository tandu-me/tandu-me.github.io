/* Renders a legal document fetched from the backend registry.
 *
 * These pages carry no legal text of their own. tandu-backend/legal/ is the one
 * source: the same files the app serves and the consent ledger hashes. A copy
 * here would be a second thing to keep in step, and the one that goes stale is
 * always the copy nobody deploys.
 *
 * The host page supplies #legal-doc with data-kind and data-lang. Without
 * JavaScript the <noscript> block in the page hands the reader a direct link to
 * the plain-text route instead.
 */
(function () {
  'use strict';

  var API = 'https://api.tandu.me';

  /* Inline markup, mirroring the small markdown subset these documents use.
   * Escaping happens first and unconditionally, so nothing the response
   * contains can introduce markup of its own. */
  function inline(text) {
    var out = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    /* The local part must start alphanumeric. Hebrew attaches prepositions with
     * a hyphen - "ל-privacy@tandu.me" - and a looser pattern swallows the "ל-"
     * into the address, producing a mailto: nobody can send to. */
    /* The domain is dot-separated labels rather than "anything with dots in it",
     * so a sentence-ending full stop stays in the sentence instead of becoming
     * part of the address. */
    out = out.replace(
      /(^|[^\w.@+])([A-Za-z0-9][\w.+-]*@[\w-]+(?:\.[\w-]+)+)/g,
      '$1<a href="mailto:$2">$2</a>'
    );
    /* Skip URLs already inside an href the previous step produced, and leave
     * trailing sentence punctuation out of the link. */
    out = out.replace(
      /(^|[^"])(https?:\/\/[^\s<)]*[^\s<).,;:!?])/g,
      '$1<a href="$2">$2</a>'
    );
    return out;
  }

  function render(md) {
    var blocks = [];
    var para = [];
    var items = [];

    function flushPara() {
      if (para.length) {
        blocks.push('<p>' + inline(para.join(' ')) + '</p>');
        para = [];
      }
    }
    function flushList() {
      if (items.length) {
        blocks.push(
          '<ul>' +
            items.map(function (i) { return '<li>' + inline(i.join(' ')) + '</li>'; }).join('') +
            '</ul>'
        );
        items = [];
      }
    }

    md.split('\n').forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      if (!line.trim()) {
        flushPara();
        flushList();
        return;
      }
      var heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading) {
        flushPara();
        flushList();
        var level = heading[1].length;
        blocks.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>');
        return;
      }
      var bullet = /^[-*]\s+(.*)$/.exec(line);
      if (bullet) {
        flushPara();
        items.push([bullet[1]]);
        return;
      }
      /* An indented line continues the bullet above it. */
      if (items.length && /^\s+\S/.test(raw)) {
        items[items.length - 1].push(line.trim());
        return;
      }
      flushList();
      para.push(line.trim());
    });

    flushPara();
    flushList();
    return blocks.join('\n');
  }

  var host = document.getElementById('legal-doc');
  if (!host) return;

  var kind = host.getAttribute('data-kind');
  var lang = host.getAttribute('data-lang');
  var rawUrl = API + '/v1/app/legal/' + kind + '/raw?lang=' + lang;

  function fail() {
    /* Never leave the reader on a page that looks like an empty policy. */
    var msg =
      lang === 'he'
        ? 'לא הצלחנו לטעון את המסמך כרגע. אפשר לקרוא את הנוסח המלא כאן:'
        : "We couldn't load the document right now. The full text is here:";
    host.innerHTML =
      '<p>' + msg + ' <a href="' + rawUrl + '">' + rawUrl + '</a></p>';
  }

  fetch(API + '/v1/app/legal/' + kind + '?lang=' + lang, { credentials: 'omit' })
    .then(function (resp) {
      if (!resp.ok) throw new Error(String(resp.status));
      return resp.json();
    })
    .then(function (doc) {
      if (!doc || !doc.content) throw new Error('empty');
      host.innerHTML = render(doc.content);
      /* The rendition actually served may differ from the one requested: the
       * registry falls back to the binding language when a translation is
       * missing. Say so rather than silently showing another language. */
      if (doc.lang !== lang) {
        var note = document.createElement('p');
        note.className = 'updated';
        note.textContent =
          'This document is not available in the requested language; showing the binding ' +
          doc.binding_lang.toUpperCase() +
          ' text.';
        host.insertBefore(note, host.firstChild);
      }
      document.documentElement.setAttribute('lang', doc.lang);
      document.documentElement.setAttribute('dir', doc.lang === 'he' ? 'rtl' : 'ltr');
    })
    .catch(fail);
})();
