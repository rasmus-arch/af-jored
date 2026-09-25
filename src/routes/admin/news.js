const express = require('express');
const { query, mapRow, mapRows } = require('../../lib/db');

const router = express.Router();

router.get('/nyheter', async (req, res, next) => {
  try {
    const posts = mapRows(await query('SELECT * FROM news_posts ORDER BY created_at DESC'));
    res.render('admin/news/list', { title: 'Nyheter', posts });
  } catch (err) {
    next(err);
  }
});

router.get('/nyheter/nytt', (req, res) => {
  res.render('admin/news/form', { title: 'Ny nyhet', post: null, error: null });
});

router.post('/nyheter', async (req, res, next) => {
  try {
    const { title, body, publishedAt } = req.body;
    if (!title || !title.trim() || !body || !body.trim()) {
      return res.status(400).render('admin/news/form', { title: 'Ny nyhet', post: req.body, error: 'Rubrik och text krävs.' });
    }
    await query(
      'INSERT INTO news_posts (title, body, published_at, active, created_by_id, created_at, updated_at) VALUES (?, ?, ?, 1, ?, NOW(), NOW())',
      [title.trim(), body.trim(), publishedAt ? new Date(publishedAt) : new Date(), req.session.user.id]
    );
    res.redirect('/admin/nyheter');
  } catch (err) {
    next(err);
  }
});

router.get('/nyheter/:id/redigera', async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM news_posts WHERE id = ?', [Number(req.params.id)]);
    const post = mapRow(rows[0]);
    if (!post) return res.status(404).render('error', { title: 'Hittades inte', message: 'Nyheten kunde inte hittas.' });
    res.render('admin/news/form', { title: 'Redigera nyhet', post, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/nyheter/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await query('SELECT * FROM news_posts WHERE id = ?', [id]);
    const post = mapRow(rows[0]);
    if (!post) return res.status(404).render('error', { title: 'Hittades inte', message: 'Nyheten kunde inte hittas.' });

    const { title, body, publishedAt } = req.body;
    if (!title || !title.trim() || !body || !body.trim()) {
      return res.status(400).render('admin/news/form', { title: 'Redigera nyhet', post: { ...post, title, body }, error: 'Rubrik och text krävs.' });
    }

    await query('UPDATE news_posts SET title = ?, body = ?, published_at = ?, updated_at = NOW() WHERE id = ?', [
      title.trim(),
      body.trim(),
      publishedAt ? new Date(publishedAt) : post.publishedAt,
      id,
    ]);
    res.redirect('/admin/nyheter');
  } catch (err) {
    next(err);
  }
});

router.post('/nyheter/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await query('SELECT * FROM news_posts WHERE id = ?', [id]);
    const post = mapRow(rows[0]);
    if (!post) return res.status(404).render('error', { title: 'Hittades inte', message: 'Nyheten kunde inte hittas.' });
    await query('UPDATE news_posts SET active = ?, updated_at = NOW() WHERE id = ?', [post.active ? 0 : 1, id]);
    res.redirect('/admin/nyheter');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
