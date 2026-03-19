export interface ContentData {
  hero: {
    title: string;
    subtitle: string;
    image: string;
  };
  about: {
    title: string;
    text: string;
    image: string;
  };
  services: {
    title: string;
    items: Array<{ title: string; description: string }>;
  };
  contact: {
    title: string;
    text: string;
    email: string;
    buttonLabel: string;
  };
}
