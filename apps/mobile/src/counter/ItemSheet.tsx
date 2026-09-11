import { add, formatCedis, mul } from '@plateraa/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { newId } from '../tablet/ids';
import { Button } from '../ui/Button';
import { Choice } from '../ui/Choice';
import { Sheet } from '../ui/Sheet';
import { colors, space, text } from '../ui/theme';
import type { MenuGroup, MenuItem } from './menu';
import type { TicketLine } from './ticket';

const ruleOf = (group: MenuGroup) =>
  group.minSelect > 0
    ? group.maxSelect === 1
      ? 'Choose 1'
      : `Choose at least ${group.minSelect}`
    : group.maxSelect === null
      ? 'Optional'
      : `Optional, up to ${group.maxSelect}`;

/** Size and extras for an item, and how many. Opens only when the item needs a choice or on "Change". */
export function ItemSheet({
  item,
  line,
  onDone,
  onClose,
}: {
  item: MenuItem | null;
  /** The ticket line being changed, if any. */
  line?: TicketLine | null;
  onDone: (line: TicketLine) => void;
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
  const picked = item.groups.flatMap((group) =>
    group.modifiers.filter((modifier) => chosen[group.id]?.includes(modifier.id)),
  );
  const basePrice = variant?.price ?? item.price;
  const unitTotal = add(basePrice, ...picked.map((modifier) => modifier.priceDelta));
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

  const done = () =>
    onDone({
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
    <Sheet visible title={item.name} onClose={onClose} width={640}>
      {item.variants.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.heading}>Size</Text>
          <View style={styles.row}>
            {item.variants.map((v) => (
              <Choice
                key={v.id}
                label={v.name}
                detail={formatCedis(v.price)}
                selected={v.id === variantId}
                onPress={() => setVariantId(v.id)}
              />
            ))}
          </View>
        </View>
      )}
      {item.groups.map((group) => (
        <View key={group.id} style={styles.section}>
          <Text style={styles.heading}>
            {group.name} <Text style={styles.rule}>· {ruleOf(group)}</Text>
          </Text>
          <View style={styles.row}>
            {group.modifiers.map((modifier) => (
              <Choice
                key={modifier.id}
                label={modifier.name}
                detail={modifier.priceDelta ? `+${formatCedis(modifier.priceDelta)}` : undefined}
                selected={chosen[group.id]?.includes(modifier.id) ?? false}
                onPress={() => toggle(group, modifier.id)}
              />
            ))}
          </View>
        </View>
      ))}
      <View style={styles.footer}>
        <View style={styles.row}>
          <Button
            label="−"
            kind="secondary"
            onPress={() => setQuantity((q) => Math.max(1, q - 1))}
          />
          <Text style={styles.quantity}>{quantity}</Text>
          <Button label="+" kind="secondary" onPress={() => setQuantity((q) => q + 1)} />
        </View>
        <Button
          label={`${line ? 'Save' : 'Add'} · ${formatCedis(mul(unitTotal, quantity))}`}
          onPress={done}
          disabled={Boolean(missing)}
        />
      </View>
      {missing && <Text style={styles.rule}>{missing.name}: pick one to add this.</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  heading: { fontSize: text.body, fontWeight: '700', color: colors.ink },
  rule: { fontSize: text.small, fontWeight: '400', color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
  },
  quantity: {
    fontSize: text.title,
    fontWeight: '700',
    color: colors.ink,
    minWidth: 40,
    textAlign: 'center',
  },
});
