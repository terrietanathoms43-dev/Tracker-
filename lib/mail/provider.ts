export type MailMessage = {
  to: string;
  subject: string;
  /** Plain-text body; every email also has one for clients that block HTML. */
  text: string;
  html: string;
};

export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}
