# Herzschlag

Zweck: Der Prompt geht nach `/clear` oder einem Neustart nicht verloren. Der Orchestrator mergt nie, der Task Manager mergt; Merge immer einzeln, nie mit `&&` verkettet; vor dem Merge `gh pr update-branch`, wenn „Require branches to be up to date“ aktiv ist.

Herzschlag: Pruef mit hc read und gh pr list den Stand. Merge, was gruen und CLEAN ist, raeum danach auf, verteil den naechsten Backlog-Eintrag ohne offene Fragen an freie Worker (max. 2 Writer) und kuemmere dich um DONE-, REVIEW- und BLOCKED-Meldungen. Gibt es nichts zu tun, antworte nur nichts zu tun und warte auf den naechsten Herzschlag. Keine Umsetzung von Vertraegen ohne G1.
