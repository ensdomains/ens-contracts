# Subdomain Registrars

The Subdomain registrar is an example contract, that can be deployed to allow registration of subnames under one or more names.

The Base Registrar allows registration of names indiscriminately by simply allowing approval. The other registrars layer on top of this base contract to allow additional functionality such as renting or forever subnames. They also restrict it to names that have called setupDomain with active set to true to not accidentally allow any names to have subnames registered underneath it.
