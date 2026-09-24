// Enkel lås-fil så att t.ex. seed inte kan starta flera gånger samtidigt.
// Om seed verkar hänga (t.ex. på en långsam eller resursstrypt server) är
// det frestande att köra kommandot igen i en ny flik - men det startar då
// en till process som konkurrerar om samma databastabeller, vilket gör allt
// långsammare och kan få processer att hopa sig. Låsfilen stoppar det
// tidigt med ett tydligt felmeddelande istället.
const fs = require('fs');

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = ingen sådan process (död). EPERM = kör men ägs av någon annan
    // - anta då att den fortfarande lever, för säkerhets skull.
    return err.code === 'EPERM';
  }
}

// Kör `fn` under ett lås. Kastar ett tydligt fel om ett annat, fortfarande
// levande, lås redan finns.
async function withLock(lockPath, fn) {
  if (fs.existsSync(lockPath)) {
    const pid = Number(fs.readFileSync(lockPath, 'utf8').trim());
    if (pid && isProcessAlive(pid)) {
      throw new Error(
        `En annan körning verkar redan pågå (process ${pid}). Vänta tills den blir klar istället för att starta en till - annars konkurrerar de om samma databastabeller. Om du är säker på att inget kör längre, ta bort filen ${lockPath} och försök igen.`
      );
    }
    // Låsfilen är kvar från en process som inte längre lever - kan tas bort.
    fs.unlinkSync(lockPath);
  }

  fs.writeFileSync(lockPath, String(process.pid));
  try {
    return await fn();
  } finally {
    try {
      if (fs.existsSync(lockPath) && fs.readFileSync(lockPath, 'utf8').trim() === String(process.pid)) {
        fs.unlinkSync(lockPath);
      }
    } catch {
      // Lås-städning är best effort - inget att göra om den redan är borta.
    }
  }
}

module.exports = { withLock, isProcessAlive };
