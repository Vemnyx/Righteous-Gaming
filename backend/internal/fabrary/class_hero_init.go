package fabrary

import "righteous-gaming/backend/internal/domain"

var fabClassKeyToSmallint = map[string]int16{}
var fabHeroKeyToSmallint = map[string]int16{}
var fabFusionKeyToSmallint = map[string]int16{}

func init() {
	for _, c := range domain.CardClasses() {
		fabClassKeyToSmallint[c.String()] = int16(c)
	}
	for _, h := range domain.CardHeroes() {
		fabHeroKeyToSmallint[h.String()] = int16(h)
	}
	for _, f := range domain.CardFusions() {
		fabFusionKeyToSmallint[f.String()] = int16(f)
	}
}
