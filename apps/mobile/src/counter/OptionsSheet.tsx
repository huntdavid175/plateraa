import { add, mul } from '@plateraa/shared';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { newId } from '../tablet/ids';
import { Button } from '../ui/Button';
import { OptionTile, Stepper } from '../ui/controls';
import { Label } from '../ui/Field';
import { CloseButton, Overlay } from '../ui/Sheet';
import { cedis, colors, font, space, text } from '../ui/theme';
import type { MenuGroup, MenuItem } from './menu';
import type { TicketLine } from './ticket';

const ruleOf = (group: MenuGroup) =>
  group.minSelect > 0
    ? group.maxSelect === 1
      ? 'choose 1'
      : `choose at least ${group.minSelect}`
    : group.maxSelect === null
      ? 'optional'
      : `choose up to ${group.maxSelect}`;

/**
 * An item's size and extras, sliding in over the order column. Opens only for items that have
 * them, or from "Change" on a line; two or three taps and it's on the order.
 */
export function OptionsSheet({
  item,
  line,
  onAdd,
  onClose,
}: {
  item: MenuItem | null;
  /** The line being changed, if any. */
  line?: TicketLine;
  onAdd: (line: TicketLine) => void;
  onClose: () => void;
}) {
  const [variantId, setVariantId] = useState<string | undefined>();
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!item) return;
    setVariantId(line?.variantId ?? item.variants[0]?.id);
    setChosen(
      Object.fromEntries(
        item.groups.map((group) => [
          group.id,
          group.modifiers
            .filter((modifier) => line?.modifiers.some((m) => m.modifierId === modifier.id))
            .map((modifier) => modifier.id),
        ]),
      ),
    );
    setQuantity(line?.quantity ?? 1);
  }, [item, line]);

  if (!item) return null;

  const variant = item.variants.find((v) => v.id === variantId);
  const basePrice = variant?.price ?? item.price;
  const picked = item.groups.flatMap((group) =>
    group.modifiers.filter((modifier) => chosen[group.id]?.includes(modifier.id)),
  );
  const lineTotal = mul(add(basePrice, ...picked.map((m) => m.priceDelta)), quantity);
  const missing = item.groups.find((group) => (chosen[group.id]?.length ?? 0) < group.minSelect);

  const toggle = (group: MenuGroup, modifierId: string) =>
    setChosen((current) => {
      const now = current[group.id] ?? [];
      if (now.includes(modifierId)) {
        return { ...current, [group.id]: now.filter((id) => id !== modifierId) };
      }
      if (group.maxSelect === 1) return { ...current, [group.id]: [modifierId] };
      if (group.maxSelect !== null && now.length >= group.maxSelect) return current;
      return { ...current, [group.id]: [...now, modifierId] };
    });

  const add_ = () =>
    onAdd({
      lineId: line?.lineId ?? newId(),
      itemId: item.id,
      ...(variant ? { variantId: variant.id, variantName: variant.name } : {}),
      name: item.name,
      unitPrice: basePrice,
      modifiers: picked.map((modifier) => ({
        modifierId: modifier.id,
        name: modifier.name,
        unitPriceDelta: modifier.priceDelta,
        quantity: 1,
      })),
      quantity,
      ...(line?.note ? { note: line.note } : {}),
    });

  return (
    <Overlay visible side="right" onClose={onClose}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title}>{item.name}</Text>
          <Text style={styles.price}>{cedis(basePrice)}</Text>
        </View>
        <CloseButton onPress={onClose} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {item.variants.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              SIZE <Text style={styles.rule}>choose 1</Text>
            </Text>
            <View style={styles.grid}>
              {item.variants.map((v) => (
                <View key={v.id} style={styles.cell}>
                  <OptionTile
                    label={v.name}
                    detail={cedis(v.price)}
                    selected={v.id === variantId}
                    onPress={() => setVariantId(v.id)}
                  />
                </View>
              ))}
            </View>
          </View>
        )}
        {item.groups.map((group) => {
          const count = chosen[group.id]?.length ?? 0;
          const full = group.maxSelect !== null && group.maxSelect > 1 && count >= group.maxSelect;
          return (
            <View key={group.id} style={styles.section}>
              <Text style={styles.sectionTitle}>
                {group.name.toUpperCase()} <Text style={styles.rule}>{ruleOf(group)}</Text>
              </Text>
              <View style={styles.grid}>
                {group.modifiers.map((modifier) => {
                  const on = chosen[group.id]?.includes(modifier.id) ?? false;
                  return (
                    <View key={modifier.id} style={styles.cell}>
                      <OptionTile
                        label={modifier.name}
                        detail={modifier.priceDelta ? `+${cedis(modifier.priceDelta)}` : 'Free'}
                        selected={on}
                        disabled={!on && full}
                        onPress={() => toggle(group, modifier.id)}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.foot}>
        <View style={styles.footRow}>
          <Stepper value={quantity} min={1} onChange={setQuantity} />
          <View style={styles.lineTotal}>
            <Label text="Line total" />
            <Text style={styles.lineTotalValue}>{cedis(lineTotal)}</Text>
          </View>
        </View>
        {missing && (
          <Text style={styles.missing}>Choose the {missing.name.toLowerCase()} first.</Text>
        )}
        <Button
          label={`${line ? 'Save' : 'Add to order'} · ${cedis(lineTotal)}`}
          onPress={add_}
          disabled={Boolean(missing)}
        />
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: space.lg,
    paddingTop: 20,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headText: { flex: 1, gap: 4 },
  title: { fontFamily: font.semibold, fontSize: 18, color: colors.ink },
  price: { fontFamily: font.mono, fontSize: 15, color: colors.muted },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  section: { paddingTop: 20, gap: 12 },
  sectionTitle: {
    fontFamily: font.semibold,
    fontSize: 13,
    letterSpacing: 0.4,
    color: colors.ink,
  },
  rule: { fontFamily: font.regular, fontSize: 13, letterSpacing: 0, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { width: '48.8%' },
  foot: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: 12,
  },
  footRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lineTotal: { alignItems: 'flex-end', gap: 2 },
  lineTotalValue: { fontFamily: font.monoMedium, fontSize: text.heading, color: colors.ink },
  missing: { fontFamily: font.medium, fontSize: 13, color: colors.brandInk },
});
