---
name: Badges stopped appearing
about: Netflix likely changed its DOM and card detection broke
title: 'Badges not appearing on [page]'
labels: dom-break
---

**Console output**

Enable debug logging in the Netflix tab, reload, and paste anything prefixed `[nfimdb]`:

```js
localStorage.setItem('nfimdb:debug', '1')
```

```
paste here
```

**Where**

- [ ] Row cards on the browse page
- [ ] Detail view / preview modal
- [ ] Search results
- [ ] Everywhere

**Environment**

- Browser and version:
- OS:
- Netflix region:

**Card markup**

Right-click a title card → Inspect → right-click the element → Copy → Copy outerHTML.
Paste it here. This is the single most useful thing in the report — it is what the fix is
written against.

```html
paste here
```
