-- Ajoute le site web d'Issa Touré à son profil (Mon QR code / vCard) et à sa fiche de contact de référence,
-- dans la vraie mission et dans le bac à sable. Sans danger si on l'exécute plusieurs fois.

update public.profiles
   set website = 'https://www.issatoure.com', updated_at = now()
 where lower(email) = 'diguifils@gmail.com' and coalesce(website, '') = '';

update public.contacts
   set website = 'https://www.issatoure.com', updated_at = now()
 where name = 'Issa Touré' and author_id is null and coalesce(website, '') = '';
