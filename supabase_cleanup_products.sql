
delete from products
where
  lower(name) in (
    'produit','produits','fournisseur','fournisseurs','note','notes',
    'stock','stock actuel','quantité','quantite','à commander','a commander',
    'suggestion','semaine dernière','semaine derniere','moyenne','historique',
    'total','totaux','nombre de produits','livraison','livraisons'
  )
  or lower(name) like '%jour de livraison%'
  or lower(name) like '%jours de livraison%'
  or lower(name) like '%jour commande%'
  or lower(name) like '%jours commande%'
  or lower(name) like '%commande pour%'
  or lower(name) like '%livraison pour%'
  or lower(name) like '%date de livraison%'
  or lower(name) like '%date commande%'
  or lower(name) like '%nombre de produits%'
  or lower(name) like '%produits total%'
  or lower(name) like '%total produits%'
  or lower(name) like '%préparée%'
  or lower(name) like '%preparee%'
  or lower(name) like '%passée%'
  or lower(name) like '%passee%'
  or lower(name) ~ '^\\d+\\s*(produit|produits|référence|references?)$'
  or lower(name) ~ '^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\\b';
