const express = require('express');
const prisma = require('../../lib/prisma');

const router = express.Router();

router.get('/nyheter', async (req, res, next) => {
  try {
    const posts = await prisma.newsPost.findMany({ orderBy: { createdAt: 'desc' } });
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
    await prisma.newsPost.create({
      data: {
        title: title.trim(),
        body: body.trim(),
        publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
        active: true,
        createdById: req.session.user.id,
      },
    });
    res.redirect('/admin/nyheter');
  } catch (err) {
    next(err);
  }
});

router.get('/nyheter/:id/redigera', async (req, res, next) => {
  try {
    const post = await prisma.newsPost.findUnique({ where: { id: Number(req.params.id) } });
    if (!post) return res.status(404).render('error', { title: 'Hittades inte', message: 'Nyheten kunde inte hittas.' });
    res.render('admin/news/form', { title: 'Redigera nyhet', post, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/nyheter/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const post = await prisma.newsPost.findUnique({ where: { id } });
    if (!post) return res.status(404).render('error', { title: 'Hittades inte', message: 'Nyheten kunde inte hittas.' });

    const { title, body, publishedAt } = req.body;
    if (!title || !title.trim() || !body || !body.trim()) {
      return res.status(400).render('admin/news/form', { title: 'Redigera nyhet', post: { ...post, title, body }, error: 'Rubrik och text krävs.' });
    }

    await prisma.newsPost.update({
      where: { id },
      data: { title: title.trim(), body: body.trim(), publishedAt: publishedAt ? new Date(publishedAt) : post.publishedAt },
    });
    res.redirect('/admin/nyheter');
  } catch (err) {
    next(err);
  }
});

router.post('/nyheter/:id/vaxla-aktiv', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const post = await prisma.newsPost.findUnique({ where: { id } });
    if (!post) return res.status(404).render('error', { title: 'Hittades inte', message: 'Nyheten kunde inte hittas.' });
    await prisma.newsPost.update({ where: { id }, data: { active: !post.active } });
    res.redirect('/admin/nyheter');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
