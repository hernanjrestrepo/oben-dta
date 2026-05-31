import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { Quote } from './quote.entity';

@Entity('quote_items')
export class QuoteItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Quote, (quote) => quote.items)
  @JoinColumn({ name: 'quote_id' })
  quote: Quote;

  @Column({ name: 'quote_id' })
  quoteId: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id' })
  productId: string;

  @Column()
  quantity: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  totalPrice: number;
}
