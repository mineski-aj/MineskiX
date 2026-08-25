// routes/led.js — all /led/* routes
const express = require('express');
const router  = express.Router();
const state   = require('../lib/state');

const noStore = { "Cache-Control": "no-store" };

router.get('/led/home', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_side\ndata: {"side":"home"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, side: "home" });
});

router.get('/led/swap', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_side\ndata: {"side":"swap"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, side: "swap" });
});

router.get('/led/fightshow', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_fight\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "show" });
});

router.get('/led/fighthide', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_fight\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "hide" });
});

router.get('/led/draftpredshow', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_draftpred\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "show" });
});

router.get('/led/draftpredhide', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_draftpred\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "hide" });
});

router.get('/led/winshow', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_win\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "show" });
});

router.get('/led/winhide', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_win\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "hide" });
});

router.get('/led/healthshow', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_health\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "show" });
});

router.get('/led/healthhide', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_health\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "hide" });
});

module.exports = router;
