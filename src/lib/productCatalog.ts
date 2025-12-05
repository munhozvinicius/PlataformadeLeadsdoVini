export type ProductCatalogItem = {
  id: string;
  tower: string;
  category: string;
  name: string;
};

const rawCatalog: Array<Pick<ProductCatalogItem, "tower" | "category" | "name">> = [
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 10 + 50 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 10 + 100 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 10 + 200 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 10 + 300 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 10 + 400 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 10 + 500 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 10 + 700 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 10 + 900 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 15 + 30 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 15 + 50 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 15 + 100 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 15 + 200 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 15 + 300 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 15 + 400 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 15 + 500 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 15 + 700 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 15 + 900 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 30 + 30 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 30 + 50 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 30 + 100 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 30 + 200 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 30 + 300 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 30 + 400 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 30 + 500 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 30 + 700 Mbps" },
  { tower: "Avançados", category: "Combo SIP + Internet Dedicada", name: "SIP 30 + 900 Mbps" },
  { tower: "Avançados", category: "SIP", name: "10 canais" },
  { tower: "Avançados", category: "SIP", name: "15 canais" },
  { tower: "Avançados", category: "SIP", name: "30 canais" },
  { tower: "Avançados", category: "SIP", name: "60 canais" },
  { tower: "Avançados", category: "SIP", name: "90 canais" },
  { tower: "Avançados", category: "0800 FLEX", name: "R$150 / 1.111 min" },
  { tower: "Avançados", category: "0800 FLEX", name: "R$200 / 2.500 min" },
  { tower: "Avançados", category: "0800 FLEX", name: "R$250 / 3.125 min" },
  { tower: "Avançados", category: "0800 FLEX", name: "R$300 / 4.285 min" },
  { tower: "Avançados", category: "0800 Ilimitado", name: "4 chamadas simultâneas" },
  { tower: "Avançados", category: "0800 Ilimitado", name: "6 chamadas simultâneas" },
  { tower: "Avançados", category: "0800 Ilimitado", name: "10 chamadas simultâneas" },
  { tower: "Avançados", category: "0800 Ilimitado", name: "15 chamadas simultâneas" },
  { tower: "Avançados", category: "0800 Ilimitado", name: "30 chamadas simultâneas" },
  { tower: "Avançados", category: "0800 Ilimitado", name: "60 chamadas simultâneas" },
  { tower: "Avançados", category: "Vivo Voz Negócio", name: "1-4 licenças (24 meses)" },
  { tower: "Avançados", category: "Vivo Voz Negócio", name: "1-4 licenças (36 meses)" },
  { tower: "Avançados", category: "Vivo Voz Negócio", name: "5-8 licenças (24 meses)" },
  { tower: "Avançados", category: "Vivo Voz Negócio", name: "5-8 licenças (36 meses)" },
  { tower: "Avançados", category: "Vivo Voz Negócio", name: "9-20 licenças (24 meses)" },
  { tower: "Avançados", category: "Vivo Voz Negócio", name: "9-20 licenças (36 meses)" },
  { tower: "Avançados", category: "Vivo Voz Negócio", name: "21-30 licenças (24 meses)" },
  { tower: "Avançados", category: "Vivo Voz Negócio", name: "21-30 licenças (36 meses)" },
  { tower: "Avançados", category: "Vivo Voz Negócio", name: "31+ licenças (24 meses)" },
  { tower: "Avançados", category: "Vivo Voz Negócio", name: "31+ licenças (36 meses)" },
  { tower: "Fixa Básica", category: "Internet Fibra Solo", name: "400 Mega" },
  { tower: "Fixa Básica", category: "Internet Fibra Solo", name: "500 Mega" },
  { tower: "Fixa Básica", category: "Internet Fibra Solo", name: "600 Mega" },
  { tower: "Fixa Básica", category: "Internet Fibra Solo", name: "700 Mega" },
  { tower: "Fixa Básica", category: "Internet Fibra Solo", name: "1 Giga" },
  { tower: "TI", category: "Microsoft 365", name: "App for Business" },
  { tower: "TI", category: "Microsoft 365", name: "Business Basic" },
  { tower: "TI", category: "Microsoft 365", name: "Business Basic (sem Teams)" },
  { tower: "TI", category: "Microsoft 365", name: "Premium (sem Teams)" },
  { tower: "TI", category: "Microsoft 365", name: "Standard" },
  { tower: "TI", category: "Microsoft 365", name: "Standard (sem Teams)" },
  { tower: "TI", category: "Microsoft 365", name: "Enterprise" },
  { tower: "TI", category: "Microsoft 365", name: "E1 (sem Teams)" },
  { tower: "TI", category: "Microsoft 365", name: "E3 (sem Teams)" },
  { tower: "TI", category: "Microsoft 365", name: "Kiosk" },
  { tower: "TI", category: "Microsoft 365", name: "Exchange Online Plan 1" },
  { tower: "TI", category: "MDM (Combo Móvel)", name: "Datamob MDM por dispositivo" },
  { tower: "TI", category: "MDM (Gestão de Dispositivos)", name: "Datamob MDM por dispositivo" },
  { tower: "Fixa Básica", category: "Fixa Básica 2P (com Voz)", name: "400 Mbps" },
  { tower: "Fixa Básica", category: "Fixa Básica 2P (com Voz)", name: "500 Mbps" },
  { tower: "Fixa Básica", category: "Fixa Básica 2P (com Voz)", name: "600 Mbps" },
  { tower: "Fixa Básica", category: "Fixa Básica 2P (com Voz)", name: "700 Mbps" },
  { tower: "Fixa Básica", category: "Fixa Básica 2P (com Voz)", name: "1 Giga" },
  { tower: "Avançados", category: "Vivo Voz Negócio", name: "Avulso" },
  { tower: "Móvel", category: "Smart Vivo Empresas", name: "6 GB" },
  { tower: "Móvel", category: "Smart Vivo Empresas", name: "15 GB" },
  { tower: "Móvel", category: "Smart Vivo Empresas", name: "20 GB" },
  { tower: "Móvel", category: "Smart Vivo Empresas", name: "30 GB" },
  { tower: "Móvel", category: "Smart Vivo Empresas", name: "40 GB" },
  { tower: "Móvel", category: "Smart Vivo Empresas", name: "50 GB" },
  { tower: "Móvel", category: "Smart Vivo Empresas", name: "100 GB" },
  { tower: "TI", category: "SD WAN", name: "FORTNET 40F PACOTE P" },
  { tower: "TI", category: "SD WAN", name: "FORTNET 40F PACOTE M" },
  { tower: "TI", category: "SD WAN", name: "FORTNET 40F PACOTE G" },
  { tower: "TI", category: "SD WAN", name: "MERAKI MX 67 PACOTE P" },
  { tower: "TI", category: "SD WAN", name: "MERAKI MX 67 PACOTE M" },
  { tower: "TI", category: "SD WAN", name: "MERAKI MX 67 PACOTE G" },
  { tower: "TI", category: "SD WAN", name: "MERAKI MX 67 PACOTE GG" },
  { tower: "TI", category: "SD WAN", name: "HUAWEI AR651 PACOTE P" },
  { tower: "TI", category: "SD WAN", name: "HUAWEI AR651 PACOTE M" },
  { tower: "TI", category: "SD WAN", name: "HUAWEI AR651 PACOTE G" },
  { tower: "Avançados", category: "SIP + PABX 10 canais", name: "Impacta 68i 24 R.A. 8 R.IP" },
  { tower: "Avançados", category: "SIP + PABX 30 canais", name: "Impacta 140" },
  { tower: "Avançados", category: "SIP + PABX 60 canais", name: "SS600 64 R.A. 36 R.IP" },
  { tower: "Avançados", category: "SIP + PABX 90 canais", name: "SS2400 0 R.A. 300 R.IP" },
  { tower: "Avançados", category: "Aparelho IP", name: "-" },
  { tower: "Avançados", category: "Aparelho Analógico", name: "-" },
  { tower: "Avançados", category: "Internet Dedicada", name: "50 Mega" },
  { tower: "Avançados", category: "Internet Dedicada", name: "100 Mega" },
  { tower: "Avançados", category: "Internet Dedicada", name: "200 Mega" },
  { tower: "Avançados", category: "Internet Dedicada", name: "300 Mega" },
  { tower: "Avançados", category: "Internet Dedicada", name: "400 Mega" },
  { tower: "Avançados", category: "Internet Dedicada", name: "500 Mega" },
  { tower: "Avançados", category: "Internet Dedicada", name: "700 Mega" },
  { tower: "Avançados", category: "Internet Dedicada", name: "900 Mega" },
  { tower: "TI", category: "Google Workspace", name: "Business Starter - Bundle Móvel" },
  { tower: "TI", category: "Google Workspace", name: "Business Standard - Bundle Móvel" },
  { tower: "TI", category: "Google Workspace", name: "Business Plus - Bundle Móvel" },
  { tower: "TI", category: "Google Workspace", name: "Business Starter - Solo" },
  { tower: "TI", category: "Google Workspace", name: "Business Standard - Solo" },
  { tower: "TI", category: "Google Workspace", name: "Business Plus - Solo" },
];

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export const PRODUCT_CATALOG: ProductCatalogItem[] = Array.from(
  new Map(
    rawCatalog.map((item) => {
      const key = `${item.tower}|${item.category}|${item.name}`;
      return [
        key,
        {
          id: `${slugify(item.tower)}-${slugify(item.category)}-${slugify(item.name)}`,
          ...item,
        } as ProductCatalogItem,
      ];
    }),
  ).values(),
);

export const TOWER_OPTIONS = Array.from(new Set(PRODUCT_CATALOG.map((p) => p.tower)));

