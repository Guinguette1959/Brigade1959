
-- Nettoyage des lignes qui ne sont pas de vrais produits
delete from products
where
  lower(name) like '%nombre de produits%'
  or lower(name) like '%jour de livraison%'
  or lower(name) like '%jours de livraison%'
  or lower(name) like '%commande pour%'
  or lower(name) like '%stock actuel%'
  or lower(name) like '%semaine passée%'
  or lower(name) like '%semaine passee%'
  or lower(name) like '%suggestion%'
  or lower(name) like '%fournisseur%'
  or lower(name) = 'produit'
  or lower(name) = 'note'
  or lower(name) like 'info :%'
  or lower(name) like 'infos :%'
  or lower(name) like 'information%'
  or lower(name) like 'informations%'
  or lower(name) ~ '^\\d+\\s*produits?$'
  or lower(name) ~ '^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\\b';
