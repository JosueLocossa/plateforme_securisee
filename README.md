\# Plateforme de Transfert Sécurisé de Documents (POC)



POC d'une plateforme web sécurisée de transfert de documents pour l'ESAIP, conçue selon les principes de \*\*défense en profondeur\*\* et conforme aux exigences RGPD.



> ⚠️ \*\*Statut\*\* : Proof of Concept (POC). Non destiné à la production en l'état.



\---



\## 🎯 Fonctionnalités



\- \*\*Authentification JWT\*\* avec rôles utilisateurs

\- \*\*RBAC\*\* (Role-Based Access Control) à 4 niveaux : `admin`, `prof`, `scolaire`, `invite`

\- \*\*Chiffrement AES-256 AT REST\*\* des fichiers stockés

\- \*\*Audit log immuable\*\* (règles SQL `no-update` / `no-delete` au niveau base)

\- \*\*NAS simulé\*\* via dossier local (extensible vers un vrai NAS en production)

\- \*\*API REST\*\* : upload, download, listing, suppression

\- \*\*Module de demande\*\* de documents avec workflow de validation



\---



\## 🏗️ Architecture

