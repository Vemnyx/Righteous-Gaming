package fabrary

import "testing"

func TestExtractCardObjectStrings_minimal(t *testing.T) {
	src := `const cards1: Card[] = [{
cardIdentifier: "a",
 name: "A",
 defaultImage: "X1",
 rarity: Rarity.Common,
 types: [Type.Weapon],
 subtypes: [Subtype.Sword],
 classes: [Class.Warrior],
},{
 cardIdentifier: "b",
 name: "B",
 defaultImage: "X2",
 rarity: Rarity.Common,
 types: [Type.Weapon],
 subtypes: [Subtype.Sword],
 classes: [Class.Warrior],
}];`
	objs, err := ExtractCardObjectStrings(src)
	if err != nil {
		t.Fatal(err)
	}
	if len(objs) != 2 {
		t.Fatalf("got %d objects", len(objs))
	}
}
