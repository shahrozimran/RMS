'use client'

import Image from 'next/image'
import { canOptimizeFoodImage } from '@/lib/utils/images'
import { useState } from 'react'
import { Coffee, Croissant, Fish, IceCreamBowl, Pizza, Salad, Sandwich, Soup, UtensilsCrossed } from 'lucide-react'

export default function FoodVisual({ name, image, className = '' }: { name: string; image?: string | null; className?: string }) {
  const [failedImage,setFailedImage] = useState<string | null>(null)
  const value = name.toLowerCase()
  const Icon = /coffee|tea|lemon|drink|juice|cappuccino|latte/.test(value) ? Coffee : /pizza|flatbread/.test(value) ? Pizza : /burger|sandwich/.test(value) ? Sandwich : /salad|vegetable|roll/.test(value) ? Salad : /salmon|fish/.test(value) ? Fish : /cake|tiramisu|ice|dessert|brownie/.test(value) ? IceCreamBowl : /pasta|soup|wings/.test(value) ? Soup : /bread|croissant/.test(value) ? Croissant : UtensilsCrossed
  return <div className={`food-visual ${className} food-${Icon === Coffee ? 'coffee' : Icon === IceCreamBowl ? 'sweet' : Icon === Salad ? 'green' : 'warm'}`}>{image && failedImage !== image ? <Image src={image} alt={name} fill unoptimized={!canOptimizeFoodImage(image)} sizes="(max-width: 600px) 50vw, (max-width: 1200px) 33vw, 280px" onError={() => setFailedImage(image)} /> : <><span className="food-plate"><Icon aria-hidden="true" strokeWidth={1.35} /></span><span className="food-visual-caption">Freshly prepared</span></>}</div>
}
