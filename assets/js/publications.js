/*
 * Renders the Publications section from two JSON files:
 *   data/publications.json  - written by scripts/fetch_ads.py (NASA/ADS), do not edit by hand
 *   data/summaries.json     - your own plain-language summaries, edit freely
 * If either file cannot be loaded, the static list that is already in index.html
 * (#pub-fallback) is left in place.
 */
(function () {
	'use strict';

	var root = document.getElementById('pub-root');
	if (!root) return;

	// Papers whose journal matches this are listed under "Proceedings" instead of by author position.
	var PROCEEDINGS_PUB = /Boletin de la Asociacion Argentina|proceedings|conference/i;
	var PROCEEDINGS_TYPES = ['inproceedings', 'proceedings', 'abstract', 'talk', 'poster'];
	var ME = /^liempi,\s*m/i;

	var SECTIONS = [
		{ key: 'first',   title: 'First author' },
		{ key: 'second',  title: 'Second author' },
		{ key: 'collab',  title: 'Collaborations' },
		{ key: 'proc',    title: 'Proceedings' }
	];

	// ---------- helpers ----------
	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) n.className = cls;
		if (text != null) n.textContent = text;
		return n;
	}

	function link(href, text, cls) {
		var a = el('a', cls, text);
		a.href = href;
		a.target = '_blank';
		a.rel = 'noopener';
		return a;
	}

	function strip(s) {
		return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
	}

	function normId(s) {
		return String(s || '').toLowerCase().replace(/^arxiv:/, '').replace(/v\d+$/, '').trim();
	}

	// "Schleicher, Dominik R. G." -> "D. R. G. Schleicher"
	function shortName(a) {
		var i = a.indexOf(',');
		if (i < 0) return a;
		var given = a.slice(i + 1).trim().split(/\s+/).map(function (g) {
			return g.charAt(0) ? g.charAt(0) + '.' : '';
		}).join(' ');
		return (given + ' ' + a.slice(0, i)).trim();
	}

	function isMe(a) { return ME.test(strip(a)); }

	function sectionOf(p) {
		if (PROCEEDINGS_TYPES.indexOf(p.doctype) >= 0 || PROCEEDINGS_PUB.test(p.pub || '')) return 'proc';
		if (p.position === 1) return 'first';
		if (p.position === 2) return 'second';
		return 'collab';
	}

	function adsUrl(p) {
		var key = p.bibcode || (p.arxiv ? 'arXiv:' + p.arxiv : null);
		return key ? 'https://ui.adsabs.harvard.edu/abs/' + encodeURIComponent(key) + '/abstract' : null;
	}

	// ADS abstracts use $...$ for TeX; the page's MathJax is configured for \( ... \).
	function cleanAbstract(s) {
		return String(s || '')
			.replace(/<\/?[a-z][^>]*>/gi, '')
			.replace(/\$([^$]+)\$/g, '\\($1\\)');
	}

	function lookupSummary(p, summaries) {
		var ids = (p.ids || []).concat([p.bibcode, p.arxiv, p.doi]);
		for (var i = 0; i < ids.length; i++) {
			if (ids[i] && summaries[normId(ids[i])]) return summaries[normId(ids[i])];
		}
		return null;
	}

	// ---------- rendering ----------
	function authorLine(p) {
		var list = p.authors || [];
		if (!list.length) return null;
		var div = el('div', 'pub-authors');
		var show = [];
		if (list.length <= 6) {
			show = list.map(function (a, i) { return { a: a, i: i }; });
		} else {
			show = list.slice(0, 3).map(function (a, i) { return { a: a, i: i }; });
			if (p.position && p.position > 3) show.push({ gap: true }, { a: list[p.position - 1], i: p.position - 1 });
			show.push({ more: true });
		}
		show.forEach(function (s, k) {
			if (s.gap) { div.appendChild(document.createTextNode(' … ')); return; }
			if (s.more) { div.appendChild(document.createTextNode(' et al. (' + list.length + ' authors)')); return; }
			var prev = show[k - 1];
			if (k > 0 && prev && !prev.gap) div.appendChild(document.createTextNode(', '));
			var name = shortName(s.a);
			if (isMe(s.a)) div.appendChild(el('strong', null, name));
			else div.appendChild(document.createTextNode(name));
		});
		return div;
	}

	function referenceLine(p) {
		var bits = [];
		if (p.pub) bits.push(p.pub);
		if (p.volume) bits.push(p.volume);
		if (p.page) bits.push(p.page);
		var s = bits.join(', ');
		if (p.year) s += (s ? ' (' + p.year + ')' : p.year);
		return s;
	}

	function renderPaper(p, summaries) {
		var card = el('div', 'pub');

		var h = el('h4', 'pub-title');
		var url = adsUrl(p);
		if (url) h.appendChild(link(url, p.title));
		else h.textContent = p.title;
		card.appendChild(h);

		var au = authorLine(p);
		if (au) card.appendChild(au);

		var ref = referenceLine(p);
		if (ref) card.appendChild(el('div', 'pub-ref', ref));

		var tags = el('div', 'pub-tags');
		if (p.refereed) tags.appendChild(el('span', 'pub-tag', 'refereed'));
		if (typeof p.citations === 'number' && p.citations > 0) {
			tags.appendChild(el('span', 'pub-tag', p.citations + (p.citations === 1 ? ' citation' : ' citations')));
		}
		if (url) tags.appendChild(link(url, 'ADS', 'pub-tag'));
		if (p.arxiv) tags.appendChild(link('https://arxiv.org/abs/' + p.arxiv, 'arXiv', 'pub-tag'));
		if (p.doi) tags.appendChild(link('https://doi.org/' + p.doi, 'DOI', 'pub-tag'));
		if (tags.childNodes.length) card.appendChild(tags);

		var summary = lookupSummary(p, summaries);
		if (summary) {
			var box = el('div', 'pub-summary');
			box.appendChild(el('span', 'pub-label', 'In short'));
			box.appendChild(el('p', null, summary));
			card.appendChild(box);
		}

		if (p.abstract) {
			var d = el('details', 'pub-abstract');
			d.appendChild(el('summary', null, summary ? 'Full abstract' : 'Abstract'));
			d.appendChild(el('p', null, cleanAbstract(p.abstract)));
			card.appendChild(d);
		}
		return card;
	}

	function render(data, summaries) {
		var papers = data.papers || [];
		if (!papers.length) throw new Error('no papers in publications.json');

		var list = document.getElementById('pub-list');
		list.textContent = '';

		SECTIONS.forEach(function (sec) {
			var items = papers.filter(function (p) { return sectionOf(p) === sec.key; });
			if (!items.length) return;
			list.appendChild(el('h3', 'major', sec.title));
			items.forEach(function (p) { list.appendChild(renderPaper(p, summaries)); });
		});

		// header line: counts + link back to ADS + last update
		var stats = document.getElementById('pub-stats');
		if (stats) {
			stats.textContent = '';
			var refereed = papers.filter(function (p) { return p.refereed; }).length;
			var cites = papers.reduce(function (n, p) { return n + (typeof p.citations === 'number' ? p.citations : 0); }, 0);
			var txt = papers.length + ' records' + (refereed ? ', ' + refereed + ' refereed' : '') +
				(cites ? ', ' + cites + ' citations' : '') + '. ';
			stats.appendChild(document.createTextNode(txt));
			if (data.ads_query_url) stats.appendChild(link(data.ads_query_url, 'Full list on NASA/ADS'));
			if (data.generated) {
				stats.appendChild(document.createTextNode(' · updated ' + data.generated.slice(0, 10)));
			}
		}

		var fb = document.getElementById('pub-fallback');
		if (fb && fb.parentNode) fb.parentNode.removeChild(fb);
		typeset(list);
	}

	function typeset(node) {
		if (!window.MathJax || !window.MathJax.startup) return;
		window.MathJax.startup.promise
			.then(function () { return window.MathJax.typesetPromise([node]); })
			.catch(function () { /* math just stays as plain text */ });
	}

	// ---------- go ----------
	function getJSON(url) {
		return fetch(url, { cache: 'no-cache' }).then(function (r) {
			if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
			return r.json();
		});
	}

	Promise.all([
		getJSON(root.getAttribute('data-publications') || 'data/publications.json'),
		getJSON(root.getAttribute('data-summaries') || 'data/summaries.json').catch(function () { return {}; })
	]).then(function (res) {
		var raw = res[1] || {};
		var summaries = {};
		Object.keys(raw).forEach(function (k) {
			if (k.charAt(0) !== '_') summaries[normId(k)] = raw[k];
		});
		render(res[0], summaries);
	}).catch(function (err) {
		if (window.console) console.warn('Publications: keeping the static list.', err);
	});
}());
